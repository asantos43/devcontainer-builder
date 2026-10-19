// SPDX-License-Identifier: MPL-2.0
import { dialog } from 'electron'
import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readSecret } from './secrets'
import { extract, pack } from 'tar-stream'
import path from 'node:path'
import type { Readable, Writable, Duplex } from 'node:stream'
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
  const entries = new Map<string, { type: string; linkname: string }>()
  parser.on('entry', (header, stream, next) => {
    stream.on('error', () => {})
    const name = header.name.replace(/\/$/, '')
    const valid =
      (name === 'data' || name.startsWith('data/')) &&
      !name.split('/').some((p) => p === '..' || p === '.' || !p) &&
      !name.includes('\\') &&
      !/[\0\r\n]/.test(name)
    const type = header.type || 'file'
    if (
      !valid ||
      !['file', 'directory', 'symlink', 'link'].includes(type) ||
      entries.has(name) ||
      entries.size >= 1_000_000
    ) {
      stream.resume()
      parser.destroy(
        new Error(
          'Unsafe archive entry. Only files, directories and safe links under data/ are accepted.',
        ),
      )
      return
    }
    const linkname = header.linkname || ''
    if (
      ['symlink', 'link'].includes(type) &&
      (!linkname ||
        linkname.startsWith('/') ||
        linkname.includes('\\') ||
        /[\0\r\n]/.test(linkname) ||
        /^[a-z]:/i.test(linkname))
    ) {
      stream.resume()
      parser.destroy(new Error('Unsafe archive link target.'))
      return
    }
    entries.set(name, { type, linkname })
    stream.on('end', next)
    stream.resume()
  })
  await pipeline(createReadStream(filename), parser)
  if (!entries.size) throw new Error('The volume backup is empty or invalid.')
  function resolve(name: string): string {
    const pending = name.split('/'),
      result: string[] = []
    let hops = 0
    while (pending.length) {
      const part = pending.shift()!
      if (!part || part === '.') continue
      if (part === '..') {
        if (result.length <= 1) throw new Error('Unsafe archive link escapes data/.')
        result.pop()
        continue
      }
      const candidate = [...result, part].join('/'),
        link = entries.get(candidate)
      if (link?.type === 'symlink' || link?.type === 'link') {
        if (++hops > 40) throw new Error('Unsafe cyclic or excessive archive link chain.')
        if (link.type === 'link') result.length = 0
        pending.unshift(...link.linkname.split('/'))
      } else result.push(part)
      if (result.length && result[0] !== 'data')
        throw new Error('Unsafe archive link escapes data/.')
    }
    if (result[0] !== 'data') throw new Error('Unsafe archive link escapes data/.')
    return result.join('/')
  }
  const regular = new Set<string>()
  for (const [name, entry] of entries) {
    const actual = resolve(name)
    if (entry.type === 'file') {
      if (regular.has(actual)) throw new Error('Unsafe duplicate effective file path in archive.')
      regular.add(actual)
    }
  }
  for (const [name, entry] of entries)
    if (entry.type === 'link' && !regular.has(resolve(name)))
      throw new Error('Unsafe hard link must reference an archived regular file.')
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
export async function cloneVolume(
  name: string,
  url: string,
  branch: string,
  credential = '',
): Promise<string> {
  return exclusive(name, async () => {
    const reference = new URL(url)
    if (reference.protocol !== 'https:' || reference.username || reference.password)
      throw new Error('Use an HTTPS repository URL without embedded credentials.')
    let token = ''
    if (credential === 'github-cli') {
      if (reference.hostname !== 'github.com')
        throw new Error('GitHub CLI credentials can only be forwarded to github.com.')
      try {
        token = (
          await promisify(execFile)('gh', ['auth', 'token', '--hostname', 'github.com'], {
            maxBuffer: 32000,
            windowsHide: true,
          })
        ).stdout.trim()
      } catch {
        throw new Error('Sign in with gh auth login before cloning a private GitHub repository.')
      }
    } else if (credential) token = await readSecret(credential)
    if (credential && (!token || /[\r\n\0]/.test(token)))
      throw new Error('Invalid repository credential.')
    const client = await docker()
    await tracked('git', async (op) => {
      await ensureImage(client, op)
      await freshVolume(client, name)
      const container = await client.createContainer({
        Image: helperImage,
        Cmd: [
          '/bin/sh',
          '-c',
          token
            ? `set -eu
apk add --no-cache git ca-certificates
umask 077
IFS= read -r credential
printf '%s' "$credential" > /run/dcb/token
unset credential
cat > /tmp/dcb-askpass <<'ASKPASS'
#!/bin/sh
case "$1" in *Username*) printf 'x-access-token';; *) cat /run/dcb/token;; esac
ASKPASS
chmod 700 /tmp/dcb-askpass
trap 'rm -f /run/dcb/token /tmp/dcb-askpass' EXIT
GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/tmp/dcb-askpass git -c credential.helper= -c core.hooksPath=/dev/null -c http.followRedirects=false clone --branch "$1" -- "$2" /data/repository`
            : 'apk add --no-cache git ca-certificates && exec git -c core.hooksPath=/dev/null clone --branch "$1" -- "$2" /data/repository',
          'sh',
          branch || 'main',
          url,
        ],
        OpenStdin: Boolean(token),
        StdinOnce: true,
        AttachStdin: Boolean(token),
        Labels: { 'devcontainer-builder.helper': 'clone' },
        HostConfig: {
          Mounts: [{ Type: 'volume', Source: name, Target: '/data' }],
          Tmpfs: { '/run/dcb': 'rw,noexec,nosuid,size=64k,mode=0700' },
        },
      })
      const abort = () => {
        void container.kill().catch(() => {})
      }
      op.signal.addEventListener('abort', abort, { once: true })
      let input: Duplex | undefined
      try {
        input = token
          ? ((await container.attach({
              hijack: true,
              stream: true,
              stdin: true,
              stdout: false,
              stderr: false,
            })) as Duplex)
          : undefined
        input?.on('error', () => {})
        input?.resume()
        op.signal.throwIfAborted()
        await container.start()
        // Keep the upgraded stdin connection alive until the helper finishes reading it.
        // Closing an HTTP request early can discard input before apk/git starts.
        if (input) input.write(token + '\n')
        const result = await container.wait()
        const logs = await container.logs({ stdout: true, stderr: true })
        op.output(token ? logs.toString().split(token).join('[redacted]') : logs.toString())
        op.signal.throwIfAborted()
        if (result.StatusCode !== 0)
          throw new Error(
            'Clone failed; inspect the output. Partial data remains in the new volume.',
          )
      } finally {
        input?.destroy()
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
      await pipeline(
        entry,
        archive.entry({
          ...header,
          name,
          ...(header.type === 'link' && header.linkname && !header.linkname.startsWith('data/')
            ? { linkname: 'data/' + header.linkname.replace(/^\/+/, '') }
            : {}),
        }),
        { signal },
      )
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
