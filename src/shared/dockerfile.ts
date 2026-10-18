// SPDX-License-Identifier: MPL-2.0
export type BlockKind = 'instruction' | 'comment' | 'directive' | 'blank' | 'unknown'
export interface DockerBlock {
  id: string
  kind: BlockKind
  instruction?: string
  raw: string
}
export interface DockerDocument {
  blocks: DockerBlock[]
  safe: boolean
  reason?: string
  eol: string
}
export const instructions = [
  'FROM',
  'ARG',
  'ENV',
  'RUN',
  'COPY',
  'ADD',
  'WORKDIR',
  'USER',
  'EXPOSE',
  'CMD',
  'ENTRYPOINT',
  'LABEL',
  'SHELL',
  'VOLUME',
  'HEALTHCHECK',
  'STOPSIGNAL',
  'ONBUILD',
  'MAINTAINER',
]
export function parseDockerfile(text: string): DockerDocument {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? []
  const blocks: DockerBlock[] = []
  const escape = /^\s*#\s*escape\s*=\s*(`|\\)\s*$/im.exec(text)?.[1] ?? '\\'
  let safe = true
  let reason: string | undefined
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i]
    const line = raw.trim()
    let kind: BlockKind = 'unknown'
    let instruction: string | undefined
    if (!line) kind = 'blank'
    else if (/^#\s*(syntax|escape|check)\s*=/i.test(line)) kind = 'directive'
    else if (line.startsWith('#')) kind = 'comment'
    else {
      instruction = /^\s*([a-z]+)\s/i.exec(raw)?.[1].toUpperCase()
      if (instruction && instructions.includes(instruction)) {
        kind = 'instruction'
        while (raw.trimEnd().endsWith(escape) && i + 1 < lines.length) raw += lines[++i]
        if (/<<-?\s*['"]?[A-Za-z_]/.test(raw)) {
          safe = false
          reason = 'Heredoc: use source editing to preserve its body.'
        }
      } else {
        safe = false
        reason ??= 'Unknown syntax: use source editing to preserve this file.'
      }
    }
    blocks.push({ id: String(offset), kind, instruction, raw })
    offset += raw.length
  }
  return { blocks, safe, reason, eol }
}
export function editBlock(text: string, id: string, replacement: string): string {
  const doc = parseDockerfile(text)
  if (!doc.safe) throw new Error(doc.reason)
  const index = doc.blocks.findIndex((b) => b.id === id)
  if (index < 0) throw new Error('Stale Dockerfile selection.')
  if (doc.blocks[index].kind === 'directive')
    throw new Error('Edit parser directives in source mode.')
  const old = doc.blocks[index]
  const ended = /[\r\n]$/.test(old.raw)
  if (ended && replacement && !/[\r\n]$/.test(replacement)) replacement += doc.eol
  doc.blocks[index] = { ...old, raw: replacement }
  return doc.blocks.map((b) => b.raw).join('')
}
export function deleteBlock(text: string, id: string, includeComments = false): string {
  const doc = parseDockerfile(text)
  if (!doc.safe) throw new Error(doc.reason)
  const index = doc.blocks.findIndex((b) => b.id === id)
  if (index < 0 || doc.blocks[index].kind === 'directive') throw new Error('Invalid block.')
  let start = index
  if (includeComments) while (start > 0 && doc.blocks[start - 1].kind === 'comment') start--
  doc.blocks.splice(start, index - start + 1)
  return doc.blocks.map((b) => b.raw).join('')
}
export function moveBlock(
  text: string,
  id: string,
  direction: -1 | 1,
  withComments = false,
): string {
  const doc = parseDockerfile(text)
  if (!doc.safe) throw new Error(doc.reason)
  const blocks = doc.blocks
  const index = blocks.findIndex((b) => b.id === id)
  if (index < 0 || blocks[index].kind === 'directive') throw new Error('Invalid block.')
  let start = index
  if (withComments) while (start > 0 && blocks[start - 1].kind === 'comment') start--
  const end = index + 1
  let destination = direction < 0 ? start - 1 : end
  if (destination < 0 || destination >= blocks.length || blocks[destination].kind === 'directive')
    return text
  if (withComments && direction < 0)
    while (destination > 0 && blocks[destination - 1].kind === 'comment') destination--
  if (direction > 0) destination++
  const group = blocks.splice(start, end - start)
  blocks.splice(direction < 0 ? destination : destination - group.length, 0, ...group)
  return blocks
    .map((b, i) => (i < blocks.length - 1 && !/[\r\n]$/.test(b.raw) ? b.raw + doc.eol : b.raw))
    .join('')
}
export function appendBlock(text: string, raw: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return (
    text +
    (text && !/[\r\n]$/.test(text) ? eol : '') +
    raw.replace(/\r?\n/g, eol) +
    (/[\r\n]$/.test(raw) ? '' : eol)
  )
}
