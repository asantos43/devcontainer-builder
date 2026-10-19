// SPDX-License-Identifier: MPL-2.0
import { app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { atomicWrite } from './projects'

const filename = () => path.join(app.getPath('userData'), 'secrets.encrypted.json')
function available(): void {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === 'linux' &&
      ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()))
  )
    throw new Error(
      'An OS credential store is required (Secret Service/KWallet, macOS Keychain or Windows DPAPI). Unlock/configure it before saving secrets.',
    )
}
function valid(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(name)) throw new Error('Invalid secret name.')
}
async function read(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(filename(), 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw e
  }
}
let pending = Promise.resolve()
export async function listSecrets(): Promise<string[]> {
  return Object.keys(await read()).sort()
}
export async function storeSecret(name: string, value: string): Promise<void> {
  valid(name)
  available()
  if (!value || value.length > 16000 || /[\r\n\0]/.test(value))
    throw new Error('Secret must be a nonempty single-line value under 16,000 characters.')
  const task = pending.then(async () => {
    const entries = await read()
    entries[name] = safeStorage.encryptString(value).toString('base64')
    await atomicWrite(filename(), JSON.stringify(entries, null, 2))
    await fs.chmod(filename(), 0o600)
  })
  pending = task.catch(() => {})
  return task
}
export async function removeSecret(name: string): Promise<void> {
  valid(name)
  const task = pending.then(async () => {
    const entries = await read()
    delete entries[name]
    await atomicWrite(filename(), JSON.stringify(entries, null, 2))
    await fs.chmod(filename(), 0o600)
  })
  pending = task.catch(() => {})
  return task
}
export async function readSecret(name: string): Promise<string> {
  valid(name)
  available()
  const value = (await read())[name]
  if (!value) throw new Error('Saved credential not found: ' + name)
  return safeStorage.decryptString(Buffer.from(value, 'base64'))
}
