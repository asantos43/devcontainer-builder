// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, dialog: {} }))
import { parseThemeBundle } from '../src/main/themes'
function bundle() {
  return new Map([
    [
      'extension/package.json',
      Buffer.from(
        JSON.stringify({
          contributes: {
            themes: [{ label: 'Team', path: './themes/main.json', uiTheme: 'vs-dark' }],
            grammars: [
              {
                language: 'dockerfile',
                scopeName: 'source.dockerfile',
                path: './syntax/Dockerfile.tmLanguage.json',
              },
            ],
          },
        }),
      ),
    ],
    [
      'extension/themes/main.json',
      Buffer.from(
        '// keep JSONC support\n{"include":"./base.json","colors":{"editor.background":"#112233"},"tokenColors":[{"scope":["keyword.control","storage.type"],"settings":{"foreground":"#abcdef","fontStyle":"bold italic"}}]}',
      ),
    ],
    [
      'extension/themes/base.json',
      Buffer.from(
        '{"colors":{"editor.foreground":"#eeeeee"},"tokenColors":[{"scope":"string","settings":{"foreground":"#aabbcc"}}]}',
      ),
    ],
    [
      'extension/syntax/Dockerfile.tmLanguage.json',
      Buffer.from('{"scopeName":"source.dockerfile","patterns":[]}'),
    ],
  ])
}
describe('VS Code color themes', () => {
  it('loads inherited colors, complete scope selectors and contributed grammars', () => {
    const theme = parseThemeBundle(bundle(), 'fixture')[0]
    expect(theme.background).toBe('#112233')
    expect(theme.foreground).toBe('#eeeeee')
    expect(theme.tokenColors).toHaveLength(2)
    expect(theme.tokenColors[1].scope).toEqual(['keyword.control', 'storage.type'])
    expect(theme.grammars[0].language).toBe('dockerfile')
  })
  it('rejects includes escaping the VSIX root and cyclic includes', () => {
    const files = bundle()
    files.set('extension/themes/base.json', Buffer.from('{"include":"../../outside.json"}'))
    expect(() => parseThemeBundle(files)).toThrow('escapes')
    files.set('extension/themes/base.json', Buffer.from('{"include":"./main.json"}'))
    expect(() => parseThemeBundle(files)).toThrow('Cyclic')
  })
  it('ignores CSS payloads and accepts a standalone theme JSON', () => {
    const theme = parseThemeBundle(
      new Map([
        [
          'theme.json',
          Buffer.from(
            '{"type":"light","colors":{"editor.background":"url(https://example.invalid)"}}',
          ),
        ],
      ]),
    )[0]
    expect(theme.base).toBe('vs')
    expect(theme.background).toMatch(/^#/)
  })
})

it('imports legacy tmTheme defaults and grammar-only dependency bundles', () => {
  const legacy = parseThemeBundle(
    new Map([
      [
        'theme.tmTheme',
        Buffer.from(
          `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>name</key><string>Legacy</string><key>settings</key><array><dict><key>settings</key><dict><key>background</key><string>#112233</string><key>foreground</key><string>#ddeeff</string></dict></dict><dict><key>scope</key><string>keyword.control</string><key>settings</key><dict><key>foreground</key><string>#ff9900</string></dict></dict></array></dict></plist>`,
        ),
      ],
    ]),
  )[0]
  expect(legacy.background).toBe('#112233')
  expect(legacy.foreground).toBe('#ddeeff')
  expect(legacy.tokenColors[1].scope).toBe('keyword.control')
  const files = bundle()
  const manifest = JSON.parse(files.get('extension/package.json')!.toString())
  delete manifest.contributes.themes
  files.set('extension/package.json', Buffer.from(JSON.stringify(manifest)))
  const grammar = parseThemeBundle(files)[0]
  expect(grammar.grammars[0].scope).toBe('source.dockerfile')
})
