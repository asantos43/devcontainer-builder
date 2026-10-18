// SPDX-License-Identifier: MPL-2.0
import { parseDocument, isMap } from 'yaml'
import type { Config } from './types'
export function composeReferences(config: Config): string[] {
  const raw = config.dockerComposeFile
  if (raw === undefined) return []
  if (typeof raw === 'string' && raw.trim()) return [raw]
  if (Array.isArray(raw) && raw.length && raw.every((v) => typeof v === 'string' && v.trim()))
    return raw as string[]
  throw new Error('dockerComposeFile must be a path or a non-empty array of paths.')
}
export function composeServices(source: string): string[] {
  const doc = parseDocument(source)
  if (doc.errors.length) throw new Error(doc.errors.map((e) => e.message).join('\n'))
  const services = doc.get('services')
  return isMap(services) ? services.items.map((i) => String(i.key)) : []
}
export function patchCompose(source: string, key: (string | number)[], value: unknown): string {
  const doc = parseDocument(source, { keepSourceTokens: true })
  if (doc.errors.length) throw new Error('Fix YAML syntax before visual editing.')
  if (value === undefined) doc.deleteIn(key)
  else doc.setIn(key, value)
  const text = doc.toString({ lineWidth: 0 })
  return source.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text
}

export function relativeComposePath(
  context: string,
  dockerfile: string,
  directory = '.devcontainer',
): string {
  const normalize = (value: string) => {
    const parts: string[] = []
    for (const part of ('/' + directory + '/' + value).split('/')) {
      if (part === '..') parts.pop()
      else if (part && part !== '.') parts.push(part)
    }
    return parts
  }
  const from = normalize(context),
    to = normalize(dockerfile)
  while (from.length && to.length && from[0] === to[0]) {
    from.shift()
    to.shift()
  }
  return [...from.map(() => '..'), ...to].join('/')
}
