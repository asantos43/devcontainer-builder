// SPDX-License-Identifier: MPL-2.0
import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Settings } from '../shared/types'
const defaults: Settings = { locale: 'pt-BR', dockerEndpoint: '', shell: '/bin/bash', recent: [] }
function filename(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}
export async function getSettings(): Promise<Settings> {
  try {
    return { ...defaults, ...JSON.parse(await fs.readFile(filename(), 'utf8')) }
  } catch {
    return { ...defaults }
  }
}
export async function saveSettings(value: Settings): Promise<Settings> {
  await fs.mkdir(path.dirname(filename()), { recursive: true })
  await fs.writeFile(filename(), JSON.stringify(value, null, 2), { mode: 0o600 })
  return value
}
export async function remember(root: string): Promise<void> {
  const settings = await getSettings()
  settings.recent = [root, ...settings.recent.filter((s) => s !== root)].slice(0, 12)
  await saveSettings(settings)
}
