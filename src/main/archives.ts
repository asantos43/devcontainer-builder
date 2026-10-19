// SPDX-License-Identifier: MPL-2.0
import fs from 'node:fs/promises'
import yauzl from 'yauzl'
import { safeArchivePath, exclusionReason } from '../shared/paths'

export const archiveLimits = {
  entries: 5000,
  file: 64 * 1024 * 1024,
  total: 256 * 1024 * 1024,
  compressed: 128 * 1024 * 1024,
}
export function portablePath(name: string): boolean {
  return (
    safeArchivePath(name) &&
    !name
      .split('/')
      .some(
        (p) =>
          p === '.' ||
          /[<>:"|?*]/.test(p) ||
          [...p].some((c) => c.charCodeAt(0) < 32) ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
  )
}
export async function readZip(
  filename: string,
  filter: (name: string) => boolean = (name) => !exclusionReason(name),
): Promise<Map<string, Buffer>> {
  if ((await fs.stat(filename)).size > archiveLimits.compressed)
    throw new Error('ZIP exceeds the 128 MiB compressed limit.')
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(
      filename,
      { lazyEntries: true, autoClose: true, validateEntrySizes: true, strictFileNames: true },
      (e, zip) => (e || !zip ? reject(e || new Error('Invalid ZIP')) : resolve(zip)),
    ),
  )
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>(),
      names = new Set<string>()
    let count = 0,
      total = 0,
      ended = false
    const fail = (e: unknown) => {
      if (ended) return
      ended = true
      zip.close()
      reject(e)
    }
    zip.on('error', fail)
    zip.on('end', () => {
      if (!ended) {
        ended = true
        resolve(files)
      }
    })
    zip.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        const name = entry.fileName.replace(/\/$/, '')
        const key = name.normalize('NFC').toLowerCase()
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000
        if (
          ++count > archiveLimits.entries ||
          !portablePath(name) ||
          names.has(key) ||
          entry.generalPurposeBitFlag & 1 ||
          (mode && ![0x8000, 0x4000].includes(mode))
        )
          throw new Error('Unsafe, encrypted, duplicate or unsupported ZIP entry: ' + name)
        names.add(key)
        total += entry.uncompressedSize
        if (
          entry.uncompressedSize > archiveLimits.file ||
          total > archiveLimits.total ||
          (entry.uncompressedSize > 1024 * 1024 &&
            entry.uncompressedSize > Math.max(1, entry.compressedSize) * 300)
        )
          throw new Error('ZIP extraction limits exceeded.')
        if (entry.fileName.endsWith('/') || !filter(name)) {
          zip.readEntry()
          return
        }
        const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) =>
          zip.openReadStream(entry, (e, stream) =>
            e || !stream ? reject(e || new Error('Invalid ZIP stream')) : resolve(stream),
          ),
        )
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of stream) {
          const data = Buffer.from(chunk)
          size += data.length
          if (size > entry.uncompressedSize || size > archiveLimits.file)
            throw new Error('ZIP entry exceeds declared size.')
          chunks.push(data)
        }
        if (size !== entry.uncompressedSize) throw new Error('Truncated ZIP entry.')
        files.set(name, Buffer.concat(chunks))
        zip.readEntry()
      })().catch(fail)
    })
    zip.readEntry()
  })
}
