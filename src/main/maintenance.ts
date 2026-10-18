// SPDX-License-Identifier: MPL-2.0
import { app, dialog } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type { Project } from '../shared/types'
import { cli } from './runtime'
import { tracked, run } from './operations'
import {
  atomicWrite,
  createHelperScripts,
  checkedPath,
  hasChanged,
  listFiles,
  loadProject,
  pickDirectory,
  projectFor,
} from './projects'
import { getSettings } from './settings'

export async function registryLogin(
  server: string,
  username: string,
  password: string,
): Promise<void> {
  const settings = await getSettings()
  const args = ['login', server, '--username', username, '--password-stdin']
  // The Dev Containers CLI reads Docker's credential file for OCI artifacts.
  if (settings.engine === 'podman') {
    const config = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker')
    await fs.mkdir(config, { recursive: true, mode: 0o700 })
    args.push('--authfile', path.join(config, 'config.json'))
  }
  await run(settings.engine || 'docker', args, {
    input: password + '\n',
    sensitive: [password],
    timeout: 60000,
  })
}
export async function registryLogout(server: string): Promise<void> {
  const settings = await getSettings()
  const args = ['logout', server]
  if (settings.engine === 'podman')
    args.push(
      '--authfile',
      path.join(process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker'), 'config.json'),
    )
  await run(settings.engine || 'docker', args)
}
export async function applyTemplate(
  reference: string,
  options: Record<string, string>,
): Promise<Project | null> {
  const target = await pickDirectory()
  if (!target) return null
  if ((await fs.readdir(target)).length)
    throw new Error('Choose an empty folder for an OCI template.')
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-template-'))
  const written: string[] = []
  try {
    return await tracked('build', async (op) => {
      await cli(
        [
          'templates',
          'apply',
          '--workspace-folder',
          staging,
          '--template-id',
          reference,
          '--template-args',
          JSON.stringify(options),
          '--oci-auth-hardening',
        ],
        staging,
        op,
      )
      // Load the template before touching the destination; this never executes hooks.
      const preview = await loadProject(staging, undefined, undefined, false)
      const files = await listFiles(staging)
      if (!files.includes(preview.configPath))
        throw new Error('Template does not contain an exportable Dev Container configuration.')
      for (const file of files) {
        const destination = await checkedPath(target, file, true)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.copyFile(await checkedPath(staging, file), destination, fs.constants.COPYFILE_EXCL)
        written.push(destination)
      }
      const created = await loadProject(target)
      await createHelperScripts(created.id)
      return loadProject(target, created.configPath, created.id)
    })
  } catch (e) {
    for (const file of written) await fs.rm(file, { force: true })
    throw e
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
}
export async function featureVersions(id: string): Promise<string> {
  const p = projectFor(id)
  if (await hasChanged(id)) throw new Error('Reload external changes before checking Features.')
  return tracked('build', (op) =>
    cli(
      [
        'outdated',
        '--workspace-folder',
        p.root,
        '--config',
        path.join(p.root, p.configPath),
        '--output-format',
        'json',
        '--oci-auth-hardening',
      ],
      p.root,
      op,
    ),
  )
}
const lockReviews = new Map<string, { content: string; previous: string }>()
export async function featureLock(id: string): Promise<string> {
  const p = projectFor(id)
  if (await hasChanged(id)) throw new Error('Reload external changes before updating Features.')
  const file = await checkedPath(
    p.root,
    path.join(path.dirname(p.configPath), 'devcontainer-lock.json'),
    true,
  )
  const previous = await fs.readFile(file, 'utf8').catch((e) => {
    if (e.code === 'ENOENT') return ''
    throw e
  })
  const content = await tracked('build', (op) =>
    cli(
      [
        'upgrade',
        '--workspace-folder',
        p.root,
        '--config',
        path.join(p.root, p.configPath),
        '--dry-run',
        '--oci-auth-hardening',
      ],
      p.root,
      op,
    ),
  )
  JSON.parse(content)
  lockReviews.set(id, { content, previous })
  return content
}
export async function saveFeatureLock(id: string, content: string): Promise<void> {
  const p = projectFor(id)
  const review = lockReviews.get(id)
  if (!review || review.content !== content)
    throw new Error('Preview the generated lockfile before saving it.')
  const file = await checkedPath(
    p.root,
    path.join(path.dirname(p.configPath), 'devcontainer-lock.json'),
    true,
  )
  const current = await fs.readFile(file, 'utf8').catch((e) => {
    if (e.code === 'ENOENT') return ''
    throw e
  })
  if ((await hasChanged(id)) || current !== review.previous)
    throw new Error('Files changed on disk; generate a new lockfile preview.')
  await atomicWrite(file, content)
  lockReviews.delete(id)
}
export async function compare(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Configuration', extensions: ['json', 'jsonc'] }],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const stat = await fs.stat(result.filePaths[0])
  if (stat.size > 2_000_000) throw new Error('Configuration exceeds 2 MB.')
  return fs.readFile(result.filePaths[0], 'utf8')
}
export async function scan(id: string, kind: 'sbom' | 'vulnerabilities'): Promise<string> {
  const p = projectFor(id)
  const result = await dialog.showSaveDialog({
    defaultPath: `${kind}-${path.basename(p.root)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return 'Cancelled.'
  const temporary = result.filePath + '.' + randomUUID() + '.partial'
  try {
    await tracked('tests', async (op) => {
      await run(
        'trivy',
        [
          'fs',
          '--format',
          kind === 'sbom' ? 'cyclonedx' : 'json',
          '--scanners',
          'vuln',
          '--output',
          temporary,
          p.root,
        ],
        { timeout: 30 * 60 * 1000, signal: op.signal, output: op.output },
      )
    })
    JSON.parse(await fs.readFile(temporary, 'utf8'))
    await fs.rename(temporary, result.filePath)
    return result.filePath
  } finally {
    await fs.rm(temporary, { force: true })
  }
}
let updaterPromise: Promise<import('electron-updater').AppUpdater> | undefined
async function updater() {
  if (!app.isPackaged)
    throw new Error('Updates require a packaged application and a published release.')
  updaterPromise ??= import('electron-updater').then((module) => {
    const updater = module.autoUpdater ?? module.default.autoUpdater
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.setFeedURL({
      provider: 'github',
      owner: 'asantos43',
      repo: 'devcontainer-builder',
      private: true,
      token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    })
    updater.on('error', () => {
      /* errors are returned to the invoking action */
    })
    return updater
  })
  return updaterPromise
}
let downloaded = false
let updateAvailable = false
export async function update(action: 'check' | 'download' | 'install'): Promise<string> {
  const service = await updater()
  if (action === 'check') {
    if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN)
      throw new Error(
        'This private repository requires GH_TOKEN or GITHUB_TOKEN to check releases.',
      )
    const result = await service.checkForUpdates()
    updateAvailable = Boolean(result?.isUpdateAvailable)
    return updateAvailable ? `Available: ${result?.updateInfo.version}` : 'Up to date.'
  }
  if (action === 'download') {
    if (!updateAvailable) throw new Error('Check for an available update first.')
    await service.downloadUpdate()
    downloaded = true
    return 'Update downloaded. Restart to install.'
  }
  if (!downloaded) throw new Error('Download an update before installing it.')
  service.quitAndInstall()
  return 'Restarting…'
}
export async function automaticUpdateCheck(): Promise<void> {
  if (app.isPackaged && (await getSettings()).autoUpdate) {
    try {
      await update('check')
    } catch {
      /* Settings offers an explicit check with error details. */
    }
  }
}
