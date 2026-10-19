// SPDX-License-Identifier: MPL-2.0
import * as monaco from 'monaco-editor'
import { Registry, INITIAL, parseRawGrammar, type StateStack } from 'vscode-textmate'
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma'
import wasmUrl from 'vscode-oniguruma/release/onig.wasm?url&inline'
import type { ImportedTheme } from '../../shared/imported-themes'
let onig:
  | Promise<{
      createOnigScanner: (patterns: string[]) => OnigScanner
      createOnigString: (value: string) => OnigString
    }>
  | undefined
class TokensState implements monaco.languages.IState {
  constructor(readonly stack: StateStack) {}
  clone() {
    return new TokensState(this.stack)
  }
  equals(other: monaco.languages.IState) {
    return other instanceof TokensState && this.stack.equals(other.stack)
  }
}
export async function installTextMate(
  theme: ImportedTheme,
  disposed: () => boolean,
): Promise<() => void> {
  const registrations: monaco.IDisposable[] = []
  onig ??= Promise.resolve(
    Uint8Array.from(atob(wasmUrl.split(',')[1]), (c) => c.charCodeAt(0)).buffer,
  )
    .then((buffer) => loadWASM(buffer))
    .then(() => ({
      createOnigScanner: (patterns: string[]) => new OnigScanner(patterns),
      createOnigString: (value: string) => new OnigString(value),
    }))
  const registry = new Registry({
    onigLib: onig,
    theme: {
      name: theme.name,
      settings: [
        { settings: { foreground: theme.foreground, background: theme.background } },
        ...theme.tokenColors,
      ],
    },
    loadGrammar: async (scope) => {
      const raw = theme.grammars.find((g) => g.scope === scope)
      return raw ? parseRawGrammar(raw.content, raw.filename) : null
    },
    getInjections: (scope) =>
      theme.grammars.filter((g) => g.injectTo.includes(scope)).map((g) => g.scope),
  })
  try {
    for (const item of theme.grammars) {
      if (!item.language) continue
      const language = item.language === 'jsonc' ? 'json' : item.language
      if (!monaco.languages.getLanguages().some((l) => l.id === language))
        monaco.languages.register({ id: language })
      const embeddedLanguages = Object.fromEntries(
        Object.entries(item.embeddedLanguages).map(([scope, lang]) => [
          scope,
          monaco.languages.getEncodedLanguageId(lang),
        ]),
      )
      const grammar = await registry.loadGrammarWithConfiguration(
        item.scope,
        monaco.languages.getEncodedLanguageId(language),
        { embeddedLanguages },
      )
      if (!grammar || disposed()) continue
      registrations.push(
        monaco.languages.setTokensProvider(language, {
          getInitialState: () => new TokensState(INITIAL),
          tokenizeEncoded(line, state) {
            const result = grammar.tokenizeLine2(line, (state as TokensState).stack, 25)
            return { tokens: result.tokens, endState: new TokensState(result.ruleStack) }
          },
        }),
      )
    }
    if (!disposed() && theme.grammars.length) monaco.languages.setColorMap(registry.getColorMap())
    if (disposed()) {
      registrations.forEach((r) => r.dispose())
      registry.dispose()
    }
    return () => {
      registrations.forEach((r) => r.dispose())
      registry.dispose()
    }
  } catch (e) {
    registrations.forEach((r) => r.dispose())
    registry.dispose()
    throw e
  }
}
