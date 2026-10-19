// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pack, type Header } from 'tar-stream'
vi.mock('electron', () => ({ dialog: {} }))
import { normalizeVolumeArchive, validateVolumeArchive } from '../src/main/volumes'
let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-tar-'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})
async function archive(header: Partial<Header> & Pick<Header, 'name'>) {
  const file = path.join(root, 'backup.tar')
  const stream = pack()
  stream.entry(header, header.type === 'symlink' ? '' : 'test')
  stream.finalize()
  await pipeline(stream, createWriteStream(file))
  return file
}
describe('volume backup validation', () => {
  it('accepts files inside the data directory', async () => {
    await expect(
      validateVolumeArchive(await archive({ name: 'data/workspace/readme.txt', type: 'file' })),
    ).resolves.toBeUndefined()
  })
  it.each(['../escape', 'data/../../escape', '/data/absolute', 'data\\escape', 'other/file'])(
    'rejects unsafe archive path %s',
    async (name) => {
      await expect(validateVolumeArchive(await archive({ name, type: 'file' }))).rejects.toThrow(
        'Unsafe',
      )
    },
  )
  it('rejects symbolic links that could escape the volume', async () => {
    await expect(
      validateVolumeArchive(
        await archive({ name: 'data/link', type: 'symlink', linkname: '/etc' }),
      ),
    ).rejects.toThrow('Unsafe')
  })
})

it('normalizes Podman absolute paths into the portable backup prefix', async () => {
  const raw = pack()
  raw.entry({ name: '/', type: 'directory' })
  raw.entry({ name: '/ready.txt' }, 'actual content')
  raw.finalize()
  const source = new PassThrough()
  raw.pipe(source)
  const file = path.join(root, 'podman.tar')
  await normalizeVolumeArchive(source, createWriteStream(file))
  await expect(validateVolumeArchive(file)).resolves.toBeUndefined()
})

it('accepts internal symbolic/hard links and POSIX metadata', async () => {
  const file = path.join(root, 'links.tar'),
    tar = pack()
  tar.entry(
    { name: 'data/file', mode: 0o751, uid: 1000, gid: 1000, mtime: new Date('2024-01-01') },
    'data',
  )
  tar.entry({ name: 'data/nested', type: 'directory' })
  tar.entry({ name: 'data/nested/symbolic', type: 'symlink', linkname: '../file' })
  tar.entry({ name: 'data/hard', type: 'link', linkname: 'data/file' })
  tar.finalize()
  await pipeline(tar, createWriteStream(file))
  await expect(validateVolumeArchive(file)).resolves.toBeUndefined()
})
it('rejects chained link escapes and cyclic links', async () => {
  const file = path.join(root, 'links.tar'),
    tar = pack()
  tar.entry({ name: 'data/a', type: 'symlink', linkname: 'b' })
  tar.entry({ name: 'data/b', type: 'symlink', linkname: 'a' })
  tar.finalize()
  await pipeline(tar, createWriteStream(file))
  await expect(validateVolumeArchive(file)).rejects.toThrow('cyclic')
})
