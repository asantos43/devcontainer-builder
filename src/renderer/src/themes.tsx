// SPDX-License-Identifier: MPL-2.0
import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import * as monaco from 'monaco-editor'
import { getTheme, type AppTheme } from '../../shared/themes'
import type { ImportedTheme } from '../../shared/imported-themes'
import { installTextMate } from './textmate'
const ThemeContext = createContext<AppTheme>(getTheme('dark-modern'))
export const useTheme = () => useContext(ThemeContext)
export function useImportedThemes() {
  const [themes, setThemes] = useState<ImportedTheme[]>([])
  useEffect(() => {
    let disposed = false
    const update = () => {
      void window.builder.extensions
        .list()
        .then((value) => {
          if (!disposed) setThemes(value)
        })
        .catch(() => {})
    }
    update()
    window.addEventListener('dcb-themes', update)
    return () => {
      disposed = true
      window.removeEventListener('dcb-themes', update)
    }
  }, [])
  return themes
}
export function ThemeProvider({ id, children }: { id: string; children: ReactNode }) {
  const imported = useImportedThemes()
  const selected = imported.find((theme) => theme.id === id)
  const custom = useMemo(
    () =>
      selected
        ? {
            ...selected,
            grammars: [
              ...new Map(
                imported
                  .flatMap((theme) => theme.grammars)
                  .map((grammar) => [grammar.scope, grammar]),
              ).values(),
            ],
          }
        : undefined,
    [selected, imported],
  )
  const theme = custom ?? getTheme(id)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme.id
    root.style.colorScheme = theme.base === 'vs' || theme.base === 'hc-light' ? 'light' : 'dark'
    for (const key of [
      'background',
      'surface',
      'raised',
      'input',
      'foreground',
      'muted',
      'border',
      'accent',
      'onAccent',
      'selection',
    ] as const)
      root.style.setProperty('--' + key, theme[key])
    const light = theme.base === 'vs' || theme.base === 'hc-light'
    for (const [key, value] of Object.entries(
      light
        ? { success: '#217346', warning: '#825b00', error: '#b52030', info: '#0065a9' }
        : { success: '#89d185', warning: '#cca700', error: '#f48771', info: '#75beff' },
    ))
      root.style.setProperty('--' + key, value)
    monaco.editor.defineTheme(theme.id, {
      base: theme.base,
      inherit: true,
      rules: custom
        ? custom.tokenColors.flatMap((rule) => {
            const scopes = Array.isArray(rule.scope) ? rule.scope : (rule.scope ?? '').split(',')
            return scopes.map((token) => ({
              token: token.trim(),
              foreground: rule.settings.foreground?.slice(1),
              fontStyle: rule.settings.fontStyle,
            }))
          })
        : [],
      colors: {
        'editor.background': theme.background,
        'editor.foreground': theme.foreground,
        'editorLineNumber.foreground': theme.muted,
        'editor.selectionBackground': theme.selection,
        'editorCursor.foreground': theme.accent,
        'editorWidget.background': theme.surface,
        ...custom?.colors,
      },
    })
    monaco.editor.setTheme(theme.id)
    let disposed = false
    let cleanup: (() => void) | undefined
    if (custom?.grammars.length)
      void installTextMate(custom, () => disposed)
        .then((value) => {
          if (disposed) value()
          else cleanup = value
        })
        .catch(console.error)
    return () => {
      disposed = true
      cleanup?.()
      monaco.languages.setColorMap(null)
    }
  }, [theme, custom])
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}
export function terminalColors(theme: AppTheme) {
  const colors = (theme as Partial<ImportedTheme>).colors ?? {}
  const ansi = Object.fromEntries(
    [
      'Black',
      'Red',
      'Green',
      'Yellow',
      'Blue',
      'Magenta',
      'Cyan',
      'White',
      'BrightBlack',
      'BrightRed',
      'BrightGreen',
      'BrightYellow',
      'BrightBlue',
      'BrightMagenta',
      'BrightCyan',
      'BrightWhite',
    ]
      .filter((name) => colors['terminal.ansi' + name])
      .map((name) => [name[0].toLowerCase() + name.slice(1), colors['terminal.ansi' + name]]),
  )
  return {
    ...ansi,
    background: colors['terminal.background'] ?? theme.background,
    foreground: colors['terminal.foreground'] ?? theme.foreground,
    cursor: colors['terminalCursor.foreground'] ?? theme.accent,
    selectionBackground: colors['terminal.selectionBackground'] ?? theme.selection,
  }
}
