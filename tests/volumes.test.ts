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
