// SPDX-License-Identifier: MPL-2.0
import { dialog } from 'electron'
import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { extract, pack } from 'tar-stream'
import path from 'node:path'
import type { Readable, Writable } from 'node:stream'
import type Docker from 'dockerode'
import { docker } from './engine'
import { tracked, type Operation } from './operations'
const helperImage = 'alpine:3.22'
const volumeBusy = new Set<string>()
export function validateVolumeName(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name)) throw new Error('Invalid volume name.')
}
async function exclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
  validateVolumeName(name)
  if (volumeBusy.has(name)) throw new Error('A volume operation is already running.')
  volumeBusy.add(name)
  try {
    return await task()
  } finally {
    volumeBusy.delete(name)
  }
}
async function ensureImage(client: Docker, op: Operation): Promise<void> {
  try {
    await client.getImage(helperImage).inspect()
  } catch {
    op.output(`Pulling ${helperImage}…\n`)
    const stream = await client.pull(helperImage)
    await new Promise<void>((resolve, reject) =>
      client.modem.followProgress(stream, (e) => (e ? reject(e) : resolve())),
    )
  }
  op.signal.throwIfAborted()
}
async function freshVolume(client: Docker, name: string): Promise<void> {
  const volumes = (await client.listVolumes()).Volumes ?? []
  if (volumes.some((v) => v.Name === name))
    throw new Error('Choose a new volume name. Existing data is never overwritten.')
  await client.createVolume({ Name: name, Labels: { 'devcontainer-builder.data': 'persistent' } })
}
async function helper<T>(
  client: Docker,
  name: string,
  readOnly: boolean,
  task: (container: Docker.Container) => Promise<T>,
): Promise<T> {
  const container = await client.createContainer({
    Image: helperImage,
    Cmd: ['sleep', 'infinity'],
    Labels: { 'devcontainer-builder.helper': 'volume' },
    NetworkDisabled: true,
    HostConfig: {
      Mounts: [{ Type: 'volume', Source: name, Target: '/data', ReadOnly: readOnly }],
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
    },
  })
  try {
    await container.start()
    return await task(container)
  } finally {
    await container.remove({ force: true, v: false })
  }
}
export async function validateVolumeArchive(filename: string): Promise<void> {
  const parser = extract()
  let entries = 0
  parser.on('entry', (header, stream, next) => {
    stream.on('error', () => {
      /* parser/pipeline owns the error result */
    })
    const name = header.name.replace(/\/$/, '')
    const valid =
      (name === 'data' || name.startsWith('data/')) &&
      !name.split('/').some((p) => p === '..' || p === '.') &&
      !name.includes('\\') &&
      !/[\0\r\n]/.test(name)
    // Backup restoration intentionally accepts only files and directories; links and devices can escape a volume.
    if (!valid || !['file', 'directory'].includes(header.type || 'file') || ++entries > 1_000_000) {
      stream.resume()
      parser.destroy(
        new Error(
          'Unsafe archive entry. Only regular files and directories under data/ are accepted.',
        ),
      )
      return
    }
    stream.on('end', next)
    stream.resume()
  })
  await pipeline(createReadStream(filename), parser)
  if (!entries) throw new Error('The volume backup is empty or invalid.')
}
export async function backupVolume(name: string): Promise<string | null> {
  return exclusive(name, async () => {
    const client = await docker()
    await client.getVolume(name).inspect()
    const users = await client.listContainers({ filters: JSON.stringify({ volume: [name] }) })
    if (users.length) throw new Error('Stop containers using this volume before backing it up.')
    const chosen = await dialog.showSaveDialog({
      defaultPath: name + '.tar',
      filters: [{ name: 'Volume TAR', extensions: ['tar'] }],
    })
    if (chosen.canceled || !chosen.filePath) return null
    const temporary = chosen.filePath + '.partial'
    try {
      await tracked('build', async (op) => {
        await ensureImage(client, op)
        await helper(client, name, true, async (container) => {
          const stream = await container.getArchive({ path: '/data' })
          await normalizeVolumeArchive(
            stream as Readable,
            createWriteStream(temporary, { mode: 0o600 }),
            op.signal,
          )
        })
      })
      await fs.rename(temporary, chosen.filePath)
      return chosen.filePath
    } finally {
      await fs.rm(temporary, { force: true })
    }
  })
}
export async function restoreVolume(name: string): Promise<string | null> {
  return exclusive(name, async () => {
    const selected = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Volume TAR', extensions: ['tar'] }],
    })
    if (selected.canceled || !selected.filePaths[0]) return null
    const filename = selected.filePaths[0]
    // Validate a private copy, so an external edit cannot swap the archive after validation.
    const staging = await fs.mkdtemp(path.join((await import('node:os')).tmpdir(), 'dcb-volume-'))
    const snapshot = path.join(staging, 'backup.tar')
    try {
      await fs.copyFile(filename, snapshot)
      await validateVolumeArchive(snapshot)
      const client = await docker()
      await tracked('build', async (op) => {
        await ensureImage(client, op)
        await freshVolume(client, name)
        await helper(client, name, false, async (container) => {
          const stream = createReadStream(snapshot)
          const abort = () =>
            stream.destroy(new Error('Restore cancelled. Partial data remains in the new volume.'))
          op.signal.addEventListener('abort', abort, { once: true })
          try {
            await container.putArchive(stream, { path: '/' })
          } finally {
            op.signal.removeEventListener('abort', abort)
            stream.destroy()
          }
        })
      })
      return name
    } finally {
      await fs.rm(staging, { recursive: true, force: true })
    }
  })
}
export async function cloneVolume(name: string, url: string, branch: string): Promise<string> {
  return exclusive(name, async () => {
    const reference = new URL(url)
    if (reference.protocol !== 'https:' || reference.username || reference.password)
      throw new Error(
        'Volume cloning currently accepts public HTTPS repositories without embedded credentials.',
      )
    const client = await docker()
    await tracked('git', async (op) => {
      await ensureImage(client, op)
      await freshVolume(client, name)
      const container = await client.createContainer({
        Image: helperImage,
        Cmd: [
          '/bin/sh',
          '-c',
          'apk add --no-cache git ca-certificates && exec git clone --branch "$1" -- "$2" /data/repository',
          'sh',
          branch || 'main',
          url,
        ],
        Labels: { 'devcontainer-builder.helper': 'clone' },
        HostConfig: { Mounts: [{ Type: 'volume', Source: name, Target: '/data' }] },
      })
      const abort = () => {
        void container.kill().catch(() => {})
      }
      op.signal.addEventListener('abort', abort, { once: true })
      try {
        await container.start()
        const result = await container.wait()
        const logs = await container.logs({ stdout: true, stderr: true })
        op.output(logs.toString())
        op.signal.throwIfAborted()
        if (result.StatusCode !== 0)
          throw new Error(
            'Clone failed; inspect the output. Partial data remains in the new volume.',
          )
      } finally {
        op.signal.removeEventListener('abort', abort)
        await container.remove({ force: true, v: false })
      }
    })
    return name
  })
}

// Docker returns data/..., while Podman's compatibility API returns /... for this path.
// Normalize both to the portable data/ prefix used by the restore validator.
export async function normalizeVolumeArchive(
  source: Readable,
  target: Writable,
  signal?: AbortSignal,
): Promise<void> {
  const parser = extract(),
    archive = pack()
  const input = pipeline(source, parser, { signal })
  const output = pipeline(archive, target, { signal })
  const transform = (async () => {
    for await (const entry of parser) {
      const header = entry.header
      const name = header.name.startsWith('/')
        ? 'data' + header.name
        : header.name.replace(/^\.\//, '')
      await pipeline(entry, archive.entry({ ...header, name }), { signal })
    }
    archive.finalize()
  })()
  try {
    await Promise.all([input, output, transform])
  } catch (error) {
    parser.destroy(error as Error)
    archive.destroy(error as Error)
    throw error
  }
}
