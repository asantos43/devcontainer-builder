// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    setFeedURL: vi.fn(),
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}))
vi.mock('electron', () => ({ app: { isPackaged: true }, dialog: {} }))
vi.mock('electron-updater', () => mock)
vi.mock('../src/main/runtime', () => ({ cli: vi.fn(), runtimeState: vi.fn() }))
vi.mock('../src/main/engine', () => ({ docker: vi.fn(), engineRun: vi.fn() }))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('GH_TOKEN', '')
  vi.stubEnv('GITHUB_TOKEN', '')
})
afterEach(() => vi.unstubAllEnvs())
it('checks public releases without credentials and keeps downloads/install explicit', async () => {
  mock.autoUpdater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: false })
  const { update } = await import('../src/main/maintenance')
  await expect(update('install')).rejects.toThrow('Download an update before installing it')
  expect(mock.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  await expect(update('check')).resolves.toBe('Up to date.')
  expect(mock.autoUpdater.setFeedURL).toHaveBeenCalledWith({
    provider: 'github',
    owner: 'asantos43',
    repo: 'devcontainer-builder',
    private: false,
  })
  expect(mock.autoUpdater.autoDownload).toBe(false)
  expect(mock.autoUpdater.autoInstallOnAppQuit).toBe(false)
  await expect(update('download')).rejects.toThrow('Check for an available update first')
  mock.autoUpdater.checkForUpdates.mockResolvedValue({
    isUpdateAvailable: true,
    updateInfo: { version: '0.2.0' },
  })
  await expect(update('check')).resolves.toBe('Available: 0.2.0')
  expect(mock.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
  await expect(update('download')).resolves.toContain('Update downloaded')
  expect(mock.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  await expect(update('install')).resolves.toBe('Restarting…')
  expect(mock.autoUpdater.quitAndInstall).toHaveBeenCalledOnce()
})
