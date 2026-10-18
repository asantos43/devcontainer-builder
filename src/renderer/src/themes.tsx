// SPDX-License-Identifier: MPL-2.0
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import * as monaco from 'monaco-editor'
import { getTheme, type AppTheme } from '../../shared/themes'
const ThemeContext = createContext<AppTheme>(getTheme('dark-modern'))
export const useTheme = () => useContext(ThemeContext)
export function ThemeProvider({ id, children }: { id: string; children: ReactNode }) {
  const theme = getTheme(id)
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
      rules: [],
      colors: {
        'editor.background': theme.background,
        'editor.foreground': theme.foreground,
        'editorLineNumber.foreground': theme.muted,
        'editor.selectionBackground': theme.selection,
        'editorCursor.foreground': theme.accent,
        'editorWidget.background': theme.surface,
      },
    })
    monaco.editor.setTheme(theme.id)
  }, [theme])
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}
export function terminalColors(theme: AppTheme) {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.accent,
    selectionBackground: theme.selection,
  }
}
