// SPDX-License-Identifier: MPL-2.0
import { app, dialog } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseRawGrammar } from 'vscode-textmate'
import { readZip, portablePath } from './archives'
import { readConfig } from '../shared/config'
import { getTheme } from '../shared/themes'
import type { ImportedGrammar, ImportedTheme } from '../shared/imported-themes'
const directory = () => path.join(app.getPath('userData'), 'color-themes')
const color = (v: unknown): v is string =>
  typeof v === 'string' && /^#(?:[a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(v)
function json(text: string): Record<string, unknown> {
  const parsed = readConfig(text)
  if (parsed.errors.length) throw new Error('Invalid theme JSONC')
  return parsed.config
}
export function parseThemeBundle(
  files: Map<string, Buffer>,
  extension: string = randomUUID(),
): ImportedTheme[] {
  const manifestFile = files.has('extension/package.json')
    ? 'extension/package.json'
    : 'package.json'
  const manifest = files.has(manifestFile) ? json(files.get(manifestFile)!.toString()) : {}
  const root = manifestFile.startsWith('extension/') ? 'extension/' : ''
  const contributes = (manifest.contributes ?? {}) as Record<string, unknown>
  const resolve = (from: string, ref: string): string => {
    const value = path.posix.normalize(path.posix.join(path.posix.dirname(from), ref))
    if (!portablePath(value) || (root && !value.startsWith(root)))
      throw new Error('Theme resource escapes its extension.')
    return value
  }
  const grammars: ImportedGrammar[] = []
  if (Array.isArray(contributes.grammars))
    for (const raw of contributes.grammars) {
      const item = raw as Record<string, unknown>
      if (typeof item.path !== 'string' || typeof item.scopeName !== 'string')
        throw new Error('Invalid grammar contribution.')
      const filename = resolve(manifestFile, item.path),
        content = files.get(filename)
      if (!content || content.length > 4 * 1024 * 1024)
        throw new Error('Grammar missing or larger than 4 MiB: ' + filename)
      grammars.push({
        scope: item.scopeName,
        language: typeof item.language === 'string' ? item.language : undefined,
        content: content.toString(),
        filename,
        injectTo: Array.isArray(item.injectTo)
          ? item.injectTo.filter((s): s is string => typeof s === 'string')
          : [],
        embeddedLanguages: Object.fromEntries(
          Object.entries((item.embeddedLanguages ?? {}) as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === 'string',
          ),
        ),
      })
    }
  function load(filename: string, parents: string[] = []): Record<string, unknown> {
    if (parents.includes(filename) || parents.length > 12)
      throw new Error('Cyclic or excessive theme includes.')
    const buffer = files.get(filename)
    if (!buffer || buffer.length > 4 * 1024 * 1024)
      throw new Error('Theme resource missing or too large: ' + filename)
    const value = /\.tmTheme$/i.test(filename)
      ? (parseRawGrammar(buffer.toString(), filename) as unknown as Record<string, unknown>)
      : json(buffer.toString())
    const inherited =
      typeof value.include === 'string'
        ? load(resolve(filename, value.include), [...parents, filename])
        : {}
    let tokens = value.tokenColors ?? value.settings
    if (typeof tokens === 'string') {
      const tokenFile = files.get(resolve(filename, tokens))
      if (!tokenFile) throw new Error('Missing token color file.')
      const parsed = /\.tmTheme$/i.test(tokens)
        ? parseRawGrammar(tokenFile.toString(), tokens)
        : JSON.parse(tokenFile.toString())
      tokens = Array.isArray(parsed) ? parsed : (parsed.tokenColors ?? parsed.settings)
    }
    const defaults =
      (Array.isArray(tokens) ? tokens : []).find((token) => !token.scope)?.settings ?? {}
    return {
      ...inherited,
      ...value,
      colors: {
        ...((inherited.colors as object) ?? {}),
        ...(defaults.background ? { 'editor.background': defaults.background } : {}),
        ...(defaults.foreground ? { 'editor.foreground': defaults.foreground } : {}),
        ...((value.colors as object) ?? {}),
      },
      tokenColors: [
        ...(Array.isArray(inherited.tokenColors) ? inherited.tokenColors : []),
        ...(Array.isArray(tokens) ? tokens : []),
      ],
    }
  }
  const hasThemes = Array.isArray(contributes.themes) && contributes.themes.length > 0
  const grammarTheme = root + '__dcb_grammar_theme.json'
  if (!hasThemes && grammars.length) files.set(grammarTheme, Buffer.from('{}'))
  const contributions = hasThemes
    ? (contributes.themes as Record<string, unknown>[])
    : [
        {
          label: String(manifest.displayName ?? 'Imported theme'),
          path: grammars.length
            ? './__dcb_grammar_theme.json'
            : [...files.keys()].find((f) => f !== manifestFile),
          uiTheme: 'vs-dark',
        },
      ]
  if (!contributions.length || contributions.length > 30)
    throw new Error('Extension must contribute 1–30 color themes.')
  return contributions.map((entry, index) => {
    const filename = manifest.contributes
      ? resolve(manifestFile, String(entry.path))
      : String(entry.path)
    const raw = load(filename)
    const base =
      entry.uiTheme === 'vs' || raw.type === 'light'
        ? 'vs'
        : entry.uiTheme === 'hc-black'
          ? 'hc-black'
          : entry.uiTheme === 'hc-light'
            ? 'hc-light'
            : 'vs-dark'
    const fallback = getTheme(base === 'vs' || base === 'hc-light' ? 'light-modern' : 'dark-modern')
    const colors = Object.fromEntries(
      Object.entries((raw.colors ?? {}) as Record<string, unknown>).filter(
        (e): e is [string, string] => color(e[1]),
      ),
    )
    const choose = (key: string, original: string) => colors[key] ?? original
    const tokenColors: ImportedTheme['tokenColors'] = []
    for (const token of (raw.tokenColors ?? []) as Record<string, unknown>[]) {
      const s = token.settings as Record<string, unknown> | undefined
      if (!s) continue
      const scope =
        typeof token.scope === 'string' ||
        (Array.isArray(token.scope) && token.scope.every((v) => typeof v === 'string'))
          ? (token.scope as string | string[])
          : undefined
      tokenColors.push({
        scope,
        settings: {
          ...(color(s.foreground) ? { foreground: s.foreground } : {}),
          ...(color(s.background) ? { background: s.background } : {}),
          ...(typeof s.fontStyle === 'string' &&
          /^(?:(?:italic|bold|underline|strikethrough) ?)*$/.test(s.fontStyle)
            ? { fontStyle: s.fontStyle }
            : {}),
        },
      })
    }
    return {
      ...fallback,
      id: `custom-${extension}-${index}`,
      extension,
      name: String(entry.label ?? raw.name ?? 'Imported theme').slice(0, 100),
      base,
      colors,
      tokenColors,
      grammars,
      background: choose('editor.background', fallback.background),
      foreground: choose('editor.foreground', fallback.foreground),
      surface: choose('sideBar.background', fallback.surface),
      raised: choose('list.activeSelectionBackground', fallback.raised),
      input: choose('input.background', fallback.input),
      muted: choose('descriptionForeground', fallback.muted),
      border: choose('panel.border', fallback.border),
      accent: choose('focusBorder', fallback.accent),
      onAccent: choose('button.foreground', fallback.onAccent),
      selection: choose('editor.selectionBackground', fallback.selection),
    }
  })
}
export async function listImportedThemes(): Promise<ImportedTheme[]> {
  await fs.mkdir(directory(), { recursive: true })
  const result: ImportedTheme[] = []
  for (const name of await fs.readdir(directory()))
    if (/^[a-f0-9-]{36}\.json$/.test(name)) {
      const data = JSON.parse(
        await fs.readFile(path.join(directory(), name), 'utf8'),
      ) as ImportedTheme[]
      result.push(...data)
    }
  return result
}
export async function importThemes(): Promise<ImportedTheme[]> {
  const choice = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'VS Code color theme', extensions: ['vsix', 'zip', 'json', 'jsonc', 'tmTheme'] },
    ],
  })
  if (choice.canceled || !choice.filePaths[0]) return []
  const file = choice.filePaths[0]
  if (/\.(json|jsonc|tmTheme)$/i.test(file) && (await fs.stat(file)).size > 4 * 1024 * 1024)
    throw new Error('Theme exceeds 4 MiB.')
  const files = /\.(json|jsonc|tmTheme)$/i.test(file)
    ? new Map([
        [file.endsWith('.tmTheme') ? 'theme.tmTheme' : 'theme.json', await fs.readFile(file)],
      ])
    : await readZip(file, (name) => /\.(jsonc?|tmLanguage|tmTheme|plist)$/i.test(name))
  const id = randomUUID(),
    themes = parseThemeBundle(files, id)
  await fs.mkdir(directory(), { recursive: true })
  await fs.writeFile(path.join(directory(), id + '.json'), JSON.stringify(themes), { flag: 'wx' })
  return themes
}
