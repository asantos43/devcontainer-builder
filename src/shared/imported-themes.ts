// SPDX-License-Identifier: MPL-2.0
import type { AppTheme } from './themes'
export interface ImportedGrammar {
  scope: string
  language?: string
  content: string
  filename: string
  injectTo: string[]
  embeddedLanguages: Record<string, string>
}
export interface ImportedTheme extends AppTheme {
  extension: string
  colors: Record<string, string>
  tokenColors: {
    scope?: string | string[]
    settings: { foreground?: string; background?: string; fontStyle?: string }
  }[]
  grammars: ImportedGrammar[]
}
