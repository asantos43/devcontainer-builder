// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const mock = vi.hoisted(() => ({ root: '', available: true, backend: 'gnome_libsecret' }))
vi.mock('electron', () => ({
  app: { getPath: () => mock.root },
  dialog: {},
  safeStorage: {
    isEncryptionAvailable: () => mock.available,
    getSelectedStorageBackend: () => mock.backend,
    encryptString: (value: string) => Buffer.from(value).reverse(),
    decryptString: (value: Buffer) => Buffer.from(value).reverse().toString(),
  },
}))
import { listSecrets, readSecret, removeSecret, storeSecret } from '../src/main/secrets'
beforeEach(async () => {
  mock.root = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-vault-'))
  mock.available = true
  mock.backend = 'gnome_libsecret'
})
afterEach(async () => {
  await fs.rm(mock.root, { recursive: true, force: true })
})
describe('OS-backed credential storage adapter', () => {
  it('stores encrypted bytes, serializes concurrent changes and lists only names', async () => {
    await Promise.all([
      storeSecret('registry', 'dummy-secret-value'),
      storeSecret('repository', 'another-dummy-value'),
    ])
    expect(await listSecrets()).toEqual(['registry', 'repository'])
    expect(await readSecret('registry')).toBe('dummy-secret-value')
    expect(await fs.readFile(path.join(mock.root, 'secrets.encrypted.json'), 'utf8')).not.toContain(
      'dummy-secret-value',
    )
    await removeSecret('registry')
    expect(await listSecrets()).toEqual(['repository'])
  })
  it('refuses saving without OS encryption', async () => {
    mock.available = false
    await expect(storeSecret('token', 'dummy')).rejects.toThrow('OS credential store')
    expect(await listSecrets()).toEqual([])
  })
  it.runIf(process.platform === 'linux')('refuses the Linux plaintext fallback', async () => {
    mock.backend = 'basic_text'
    await expect(storeSecret('token', 'dummy')).rejects.toThrow('OS credential store')
  })
})
