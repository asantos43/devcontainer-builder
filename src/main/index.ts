// SPDX-License-Identifier: MPL-2.0
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { z } from 'zod'
import type { Project, Settings } from '../shared/types'
import * as projects from './projects'
import * as runtime from './runtime'
import { getSettings, saveSettings } from './settings'
import { cancel, cancelAll, run, setEventSink } from './operations'
import { exportPlan, exportZip } from './export'
import { exclusionReason, safeArchivePath } from '../shared/paths'

const registeredChannels: string[] = []
const text = z.string().max(2_000_000)
const short = z.string().max(4096)
const id = z.string().uuid()
const testCommand = z.object({
  id: short,
  name: short.min(1),
  command: text.min(1),
  cwd: short.optional(),
  timeout: z.number().int().min(100).max(3_600_000),
  expectedCode: z.number().int().min(0).max(255),
})
const auxiliary = z.object({ version: z.literal(1), tests: z.array(testCommand).max(100) })
const projectInput = z.object({
  id,
  root: short,
  configPath: short,
  dockerfilePath: short.optional(),
  configText: text,
  dockerfile: text,
  auxiliary,
  files: z.array(short).max(10000),
  baseline: z.object({ configText: text, dockerfile: text, auxiliaryText: text }),
})
const mount = z.object({
  type: z.enum(['bind', 'volume']),
  source: short.min(1),
  target: short.startsWith('/'),
  readOnly: z.boolean(),
})
const wizard = z.object({
  name: short.min(1),
  root: short.min(1),
  template: z.enum(['empty', 'node', 'python', 'ubuntu']),
  repository: z.enum(['none', 'existing', 'local', 'github', 'clone']),
  repositoryUrl: short.refine((s) => !s.startsWith('-') && !s.includes('\n')),
  branch: short.refine((s) => !s.startsWith('-') && !s.includes('\n')),
  githubOwner: z.string().regex(/^[a-zA-Z0-9-]*$/),
  githubName: z.string().regex(/^[a-zA-Z0-9_.-]*$/),
  githubPrivate: z.boolean(),
  description: short,
  base: z.enum(['image', 'dockerfile']),
  image: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/),
  remoteUser: short,
  workspaceFolder: short.startsWith('/'),
  features: z.record(z.unknown()),
  mounts: z.array(mount).max(100),
  ports: z.array(z.number().int().min(1).max(65535)).max(100),
  env: z.record(z.string()),
  postCreateCommand: text,
})
const settingsInput = z.object({
  locale: z.enum(['en', 'pt-BR']),
  dockerEndpoint: short.refine((s) => !s || s.startsWith('unix://') || s.startsWith('npipe://')),
  shell: short,
  recent: z.array(short).max(12),
})

async function jsonFetch(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  })
  if (!response.ok)
    throw new Error(`Docker Hub: HTTP ${response.status}. Try a manual image reference.`)
  return (await response.json()) as Record<string, unknown>
}
function register(win: BrowserWindow): void {
  function handle<T extends z.ZodTypeAny>(
    channel: string,
    schema: T,
    fn: (input: z.infer<T>) => unknown,
  ): void {
    registeredChannels.push(channel)
    ipcMain.handle(channel, async (event, input: unknown) => {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
        throw new Error('Unauthorized IPC sender.')
      return fn(schema.parse(input))
    })
  }
  const none = z.undefined()
  handle('settings:get', none, getSettings)
  handle('settings:save', settingsInput, async (value) =>
    saveSettings({ ...value, recent: (await getSettings()).recent } as Settings),
  )
  handle('projects:pickDirectory', none, projects.pickDirectory)
  handle('projects:open', none, projects.openProject)
  handle('projects:openRecent', short, async (root) => {
    if (!(await getSettings()).recent.includes(root))
      throw new Error('Select this directory through Open first.')
    return projects.loadProject(root)
  })
  handle('projects:create', wizard, projects.createProject)
  handle('projects:save', projectInput, (value) => projects.saveProject(value as Project))
  handle('projects:saveAs', projectInput, (value) => projects.saveAs(value as Project))
  handle('projects:reload', id, (value) => {
    const p = projects.projectFor(value)
    return projects.loadProject(p.root, p.configPath, p.id)
  })
  handle('projects:changed', id, projects.hasChanged)
  handle('system:capabilities', none, runtime.capabilities)
  handle('system:contexts', none, runtime.contexts)
  handle('git:info', id, async (value) => {
    const p = projects.projectFor(value)
    const branch = await run('git', ['branch', '--show-current'], {
      cwd: p.root,
      allowFailure: true,
    })
    const remotes = await run('git', ['remote', '-v'], { cwd: p.root, allowFailure: true })
    const status = await run('git', ['-c', 'core.fsmonitor=false', 'status', '--short'], {
      cwd: p.root,
      allowFailure: true,
    })
    const account = await run('gh', ['api', 'user', '--jq', '.login'], {
      cwd: p.root,
      allowFailure: true,
    }).catch(() => ({ stdout: 'Not logged in' }))
    return {
      branch: branch.stdout.trim(),
      remotes: remotes.stdout,
      status: status.stdout || status.stderr,
      account: account.stdout.trim(),
    }
  })
  handle('git:login', none, async () => {
    await run(
      'gh',
      ['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https'],
      {
        timeout: 600000,
        output: (value) =>
          win.webContents.send('operation:event', {
            id: 'github-login',
            channel: 'git',
            kind: 'output',
            text: value,
          }),
      },
    )
  })
  handle(
    'git:createRemote',
    z.object({
      id,
      owner: z.string().regex(/^[a-zA-Z0-9-]*$/),
      name: z
        .string()
        .min(1)
        .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/),
      privateRepo: z.boolean(),
    }),
    async (value) => {
      const p = projects.projectFor(value.id)
      const remote = await run('git', ['remote', 'get-url', 'origin'], {
        cwd: p.root,
        allowFailure: true,
      })
      if (!remote.code) throw new Error('origin already exists; it will not be overwritten.')
      await run(
        'gh',
        [
          'repo',
          'create',
          value.owner ? `${value.owner}/${value.name}` : value.name,
          value.privateRepo ? '--private' : '--public',
          '--source',
          p.root,
          '--remote',
          'origin',
        ],
        { cwd: p.root },
      )
    },
  )
  handle(
    'git:commit',
    z.object({ id, message: short.min(1), files: z.array(short).min(1).max(10000) }),
    async (value) => {
      const p = projects.projectFor(value.id)
      for (const file of value.files) {
        if (!safeArchivePath(file) || exclusionReason(file))
          throw new Error('Invalid or sensitive file selected for commit.')
        await projects.checkedPath(p.root, file)
      }
      await run('git', ['add', '--', ...value.files], { cwd: p.root })
      await run('git', ['commit', '-m', value.message, '--only', '--', ...value.files], {
        cwd: p.root,
      })
    },
  )
  handle('git:push', id, async (value) => {
    await run('git', ['push', '--set-upstream', 'origin', 'HEAD'], {
      cwd: projects.projectFor(value).root,
    })
  })
  handle(
    'images:search',
    z.object({ query: z.string().max(200), page: z.number().int().min(1).max(100) }),
    async (value) => {
      const result = await jsonFetch(
        `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(value.query || 'ubuntu')}&page=${value.page}&page_size=12`,
      )
      const rows = Array.isArray(result.results)
        ? (result.results as Record<string, unknown>[])
        : []
      return {
        results: rows.map((r) => ({
          name: String(r.repo_name),
          description: String(r.short_description ?? ''),
          stars: Number(r.star_count ?? 0),
          official: Boolean(r.is_official),
        })),
        page: value.page,
        hasNext: Boolean(result.next),
      }
    },
  )
  handle(
    'images:tags',
    z.object({
      image: z.string().regex(/^[a-zA-Z0-9_./-]+$/),
      page: z.number().int().min(1).max(100),
    }),
    async (value) => {
      const image = value.image.replace(/^docker\.io\//, '')
      const parts = image.split('/')
      if (parts.length > 2 || parts[0].includes('.'))
        throw new Error(
          'Tag discovery is available for Docker Hub images. Enter other references manually.',
        )
      const [namespace, repository] = parts.length === 1 ? ['library', image] : parts
      const result = await jsonFetch(
        `https://hub.docker.com/v2/namespaces/${namespace}/repositories/${repository}/tags?page_size=30&page=${value.page}`,
      )
      return {
        tags: ((result.results as { name: string }[]) ?? []).map((r) => r.name),
        page: value.page,
        hasNext: Boolean(result.next),
      }
    },
  )
  handle('docker:volumes', none, async () =>
    ((await (await runtime.docker()).listVolumes()).Volumes ?? []).map((v) => v.Name),
  )
  handle(
    'docker:createVolume',
    z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/),
    async (name) =>
      (
        await (
          await runtime.docker()
        ).createVolume({ Name: name, Labels: { 'devcontainer-builder.data': 'persistent' } })
      ).Name,
  )
  handle('runtime:start', id, runtime.start)
  handle('runtime:stop', id, runtime.stop)
  handle('runtime:state', id, runtime.runtimeState)
  handle('runtime:logs', id, runtime.logs)
  handle('runtime:test', id, runtime.testProject)
  handle('runtime:report', id, runtime.saveReport)
  handle('runtime:clean', id, runtime.clean)
  handle('runtime:stats', id, runtime.stats)
  handle('terminal:open', id, runtime.openTerminal)
  handle('terminal:write', z.object({ session: id, data: z.string().max(65536) }), (value) =>
    runtime.writeTerminal(value.session, value.data),
  )
  handle(
    'terminal:resize',
    z.object({
      session: id,
      cols: z.number().int().min(1).max(1000),
      rows: z.number().int().min(1).max(1000),
    }),
    (value) => runtime.resizeTerminal(value.session, value.cols, value.rows),
  )
  handle('terminal:close', id, runtime.closeTerminal)
  handle('operations:cancel', short, cancel)
  handle('exports:plan', id, exportPlan)
  handle('exports:zip', z.object({ id, files: z.array(short).max(10000) }), (value) =>
    exportZip(value.id, value.files),
  )
  handle('exports:log', text, async (value) => {
    const result = await dialog.showSaveDialog({ defaultPath: 'devcontainer-output.log' })
    if (!result.canceled && result.filePath) await fs.writeFile(result.filePath, value)
  })
}

let win: BrowserWindow | undefined
async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#17191e',
    icon: path.join(app.getAppPath(), 'build/icon.png'),
    title: 'DevContainer Builder',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  register(win)
  const window = win
  setEventSink((event) => {
    if (!window.isDestroyed()) window.webContents.send('operation:event', event)
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('will-prevent-unload', (event) => {
    const response = dialog.showMessageBoxSync(window, {
      type: 'question',
      message: 'Discard unsaved changes? / Descartar alterações não salvas?',
      buttons: ['Keep editing / Continuar editando', 'Discard / Descartar'],
      defaultId: 0,
      cancelId: 0,
    })
    if (response === 1) event.preventDefault()
  })
  win.on('closed', () => {
    cancelAll()
    runtime.closeAllSessions()
    win = undefined
    for (const channel of registeredChannels) ipcMain.removeHandler(channel)
    registeredChannels.length = 0
  })
  win.once('ready-to-show', () => {
    if (process.env.DCB_E2E !== '1' || app.isPackaged) win?.show()
  })
  if (process.env.DCB_E2E_USER_DATA && !app.isPackaged)
    app.setPath('userData', process.env.DCB_E2E_USER_DATA)
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged)
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(path.join(__dirname, '../renderer/index.html'))
}
app
  .whenReady()
  .then(createWindow)
  .catch((error) => {
    console.error(error)
    app.quit()
  })
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  cancelAll()
  runtime.closeAllSessions()
})
