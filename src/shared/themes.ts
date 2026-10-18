// SPDX-License-Identifier: MPL-2.0
// Workbench palettes adapted to the names and colors of VS Code's built-in themes.
export interface AppTheme {
  id: string
  name: string
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  background: string
  surface: string
  raised: string
  input: string
  foreground: string
  muted: string
  border: string
  accent: string
  onAccent: string
  selection: string
}
const dark = {
  base: 'vs-dark' as const,
  background: '#1f1f1f',
  surface: '#181818',
  raised: '#252526',
  input: '#313131',
  foreground: '#cccccc',
  muted: '#9d9d9d',
  border: '#454545',
  accent: '#0078d4',
  onAccent: '#ffffff',
  selection: '#264f78',
}
const light = {
  base: 'vs' as const,
  background: '#ffffff',
  surface: '#f8f8f8',
  raised: '#f0f0f0',
  input: '#ffffff',
  foreground: '#333333',
  muted: '#616161',
  border: '#cecece',
  accent: '#005fb8',
  onAccent: '#ffffff',
  selection: '#add6ff',
}
export const themes: AppTheme[] = [
  { ...dark, id: 'dark-modern', name: 'Dark Modern' },
  { ...light, id: 'light-modern', name: 'Light Modern' },
  {
    ...dark,
    id: 'dark-plus',
    name: 'Dark+ (default dark)',
    background: '#1e1e1e',
    surface: '#252526',
    accent: '#007acc',
  },
  {
    ...light,
    id: 'light-plus',
    name: 'Light+ (default light)',
    surface: '#f3f3f3',
    accent: '#007acc',
  },
  {
    ...dark,
    id: 'high-contrast',
    name: 'Dark High Contrast',
    base: 'hc-black',
    background: '#000000',
    surface: '#000000',
    raised: '#000000',
    input: '#000000',
    foreground: '#ffffff',
    muted: '#ffffff',
    border: '#ffffff',
    accent: '#ffff00',
    onAccent: '#000000',
    selection: '#0f4a85',
  },
  {
    ...light,
    id: 'high-contrast-light',
    name: 'Light High Contrast',
    base: 'hc-light',
    border: '#000000',
    foreground: '#000000',
    muted: '#292929',
    accent: '#0f4a85',
  },
  {
    ...dark,
    id: 'monokai',
    name: 'Monokai',
    background: '#272822',
    surface: '#1e1f1c',
    raised: '#3e3d32',
    input: '#2f302a',
    accent: '#a6e22e',
    onAccent: '#171a0c',
    selection: '#49483e',
  },
  {
    ...dark,
    id: 'solarized-dark',
    name: 'Solarized Dark',
    background: '#002b36',
    surface: '#00212b',
    raised: '#073642',
    input: '#003847',
    foreground: '#93a1a1',
    muted: '#839496',
    border: '#586e75',
    accent: '#2aa198',
    onAccent: '#002b36',
  },
  {
    ...light,
    id: 'solarized-light',
    name: 'Solarized Light',
    background: '#fdf6e3',
    surface: '#eee8d5',
    raised: '#eee8d5',
    input: '#fdf6e3',
    foreground: '#586e75',
    muted: '#657b83',
    border: '#93a1a1',
    accent: '#007f83',
  },
  {
    ...dark,
    id: 'abyss',
    name: 'Abyss',
    background: '#000c18',
    surface: '#060621',
    raised: '#10192c',
    input: '#101f33',
    accent: '#596f99',
    border: '#384e6d',
  },
  {
    ...dark,
    id: 'quiet-light',
    name: 'Quiet Light',
    ...light,
    background: '#f5f5f5',
    surface: '#e6e7e8',
    accent: '#705697',
  },
  {
    ...dark,
    id: 'kimbie-dark',
    name: 'Kimbie Dark',
    background: '#221a0f',
    surface: '#362712',
    raised: '#423523',
    input: '#362712',
    foreground: '#d3af86',
    muted: '#baa184',
    border: '#84613d',
    accent: '#c59a6f',
    onAccent: '#221a0f',
  },
  {
    ...dark,
    id: 'red',
    name: 'Red',
    background: '#390000',
    surface: '#330000',
    raised: '#580000',
    input: '#580000',
    border: '#a04444',
    accent: '#cc3333',
  },
]
export function getTheme(id: string): AppTheme {
  return themes.find((t) => t.id === id) ?? themes[0]
}
