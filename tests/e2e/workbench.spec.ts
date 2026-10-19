// SPDX-License-Identifier: MPL-2.0
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import Docker from 'dockerode'
import { unzipSync } from 'fflate'
import { wizardDefaults } from '../../src/shared/config'
declare global {
  interface Window {
    dcbEvents: string[]
  }
}
let application: ElectronApplication
let page: Page
let root: string

test.beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-e2e-'))
  application = await electron.launch({
    args: ['out/main/index.js'],
    env: Object.fromEntries(
      Object.entries({
        ...process.env,
        DCB_E2E_USER_DATA: path.join(root, 'settings'),
        DCB_E2E: '1',
        DOCKER_CONFIG: path.join(root, 'engine-auth'),
      }).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && typeof value === 'string'),
    ) as Record<string, string>,
  })
  page = await application.firstWindow()
  page.on('pageerror', (error) => console.error('Renderer error:', error.stack))
  await page.waitForLoadState('domcontentloaded')
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, root)
})
test.afterEach(async () => {
  await application?.close()
  await fs.rm(root, { recursive: true, force: true })
})

test('wizard creates a host repository and visual Dockerfile comments survive save', async () => {
  await page.getByRole('button', { name: 'Novo dev container', exact: true }).last().click()
  await page.getByLabel('Nome do projeto').fill('interface-fixture')
  // Keep application preferences outside the selected empty project directory.
  const destination = path.join(root, 'workspace')
  await fs.mkdir(destination)
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, destination)
  await page.getByRole('button', { name: 'Selecionar', exact: true }).click()
  await expect(page.getByPlaceholder('Selecione uma pasta local')).toHaveValue(destination)
  await page.getByLabel('Modelo inicial').selectOption('ubuntu')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByLabel('Referência da imagem').fill('alpine:3.22')
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar dev container', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral do ambiente' })).toBeVisible()
  expect(await fs.readFile(path.join(destination, '.git/HEAD'), 'utf8')).toContain(
    'refs/heads/main',
  )
  await page.locator('.outline').getByRole('button', { name: 'Dockerfile', exact: true }).click()
  await page.getByLabel('Novo bloco').selectOption('#')
  await page
    .getByLabel('Conteúdo', { exact: true })
    .fill('Preserve this documentation\nRUN disabled example')
  await page.getByRole('button', { name: 'Adicionar bloco', exact: true }).click()
  await page.getByTitle('Salvar alterações').click()
  await page.getByRole('button', { name: 'Salvar alterações revisadas', exact: true }).click()
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible()
  const dockerfile = await fs.readFile(path.join(destination, '.devcontainer/Dockerfile'), 'utf8')
  expect(dockerfile).toContain('# Preserve this documentation\n# RUN disabled example\n')
  expect(dockerfile).toContain('# Development image\nFROM alpine:3.22')
  await page.screenshot({ path: 'test-results/workbench.png', fullPage: true })
})

test('English interface and wizard cancellation do not create project files', async () => {
  await page.locator('.locale-switch').click()
  await expect(
    page.getByRole('button', { name: 'New dev container', exact: true }).last(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'New dev container', exact: true }).last().click()
  await page.getByLabel('Project name').fill('cancelled')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await fs.readdir(root)).not.toContain('.devcontainer')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Application settings' })).toBeVisible()
})

test('bundled CLI executes with the Electron utility Node runtime', async () => {
  const result = await application.evaluate(
    ({ utilityProcess }, entry) =>
      new Promise<{ code: number; output: string }>((resolve) => {
        const child = utilityProcess.fork(entry, ['--version'], { stdio: 'pipe' })
        const drained = Promise.all(
          [child.stdout, child.stderr].map((stream) =>
            stream
              ? new Promise<void>((resolve) => {
                  stream.once('end', resolve)
                  stream.once('close', resolve)
                })
              : Promise.resolve(),
          ),
        )
        let output = ''
        child.stdout?.on('data', (data) => {
          output += String(data)
        })
        child.stderr?.on('data', (data) => {
          output += String(data)
        })
        child.on('exit', (code) => {
          void drained.then(() => resolve({ code, output }))
        })
      }),
    createRequire(path.join(process.cwd(), 'package.json')).resolve(
      '@devcontainers/cli/devcontainer.js',
    ),
  )
  expect(result.code).toBe(0)
  expect(result.output).toMatch(/\d+\.\d+\.\d+/)
})

test('opens and saves variable-based mounts without configuration errors or executing hooks', async () => {
  const destination = path.join(root, 'existing-mounts')
  await fs.mkdir(path.join(destination, '.devcontainer'), { recursive: true })
  const config = {
    name: 'Task Authoring',
    image: 'alpine:3.22',
    workspaceMount: 'source=${localWorkspaceFolder},target=/workspace,type=bind',
    workspaceFolder: '/workspace',
    mounts: [
      'source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind',
      'source=${localWorkspaceFolder},target=${localWorkspaceFolder},type=bind',
    ],
    initializeCommand: 'echo unexpected > opening-hook-ran',
    custom: { preserved: true },
  }
  const filename = path.join(destination, '.devcontainer/devcontainer.json')
  await fs.writeFile(filename, '// production note\n' + JSON.stringify(config, null, 2))
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, destination)
  await page.getByRole('button', { name: 'Abrir dev container', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral do ambiente' })).toBeVisible()
  await page.locator('.panel-tabs').getByRole('button', { name: 'PROBLEMAS', exact: true }).click()
  await expect(page.getByText('Nenhum problema de configuração.', { exact: true })).toBeVisible()
  await page.getByLabel('Nome', { exact: true }).fill('Reviewed Task Authoring')
  await page.getByTitle('Salvar alterações').click()
  await page.getByRole('button', { name: 'Salvar alterações revisadas', exact: true }).click()
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible()
  const saved = await fs.readFile(filename, 'utf8')
  expect(saved).toContain('// production note')
  expect(JSON.parse(saved.slice(saved.indexOf('{')))).toEqual({
    ...config,
    name: 'Reviewed Task Authoring',
  })
  expect(await fs.readdir(destination)).not.toContain('opening-hook-ran')
  await expect(page.locator('.statusbar')).toContainText('not-created')
})

test('Docker runtime, interactive shell and exported ZIP rebuild through the real application', async () => {
  test.skip(
    process.env.DCB_DOCKER_E2E !== '1',
    'Opt in with DCB_DOCKER_E2E=1 and a local Docker daemon.',
  )
  test.setTimeout(180000)
  const destination = path.join(root, 'runtime-workspace')
  const restored = path.join(root, 'restored-workspace')
  await fs.mkdir(path.join(destination, '.devcontainer'), { recursive: true })
  await fs.writeFile(path.join(destination, 'marker.txt'), 'export-ready\n')
  await fs.writeFile(
    path.join(destination, '.devcontainer/Dockerfile'),
    '# existing production documentation\nFROM alpine:3.22\nCOPY marker.txt /image-marker\n',
  )
  const config = {
    name: 'Runtime fixture',
    build: { dockerfile: 'Dockerfile', context: '..' },
    workspaceMount: 'type=bind,source=${localWorkspaceFolder},target=/workspace',
    mounts: ['source=${localWorkspaceFolder},target=${localWorkspaceFolder},type=bind'],
    containerEnv: { HOST_WORKSPACE: '${localWorkspaceFolder}' },
    workspaceFolder: '/workspace',
    remoteUser: 'root',
    remoteEnv: { REMOTE_TEST: 'yes' },
    postCreateCommand: 'printf ready > /workspace/ready.txt',
  }
  await fs.writeFile(
    path.join(destination, '.devcontainer/devcontainer.json'),
    JSON.stringify(config, null, 2),
  )
  await fs.writeFile(
    path.join(destination, '.devcontainer/builder.json'),
    JSON.stringify({
      version: 1,
      tests: [
        {
          id: 'runtime',
          name: 'Runtime check',
          command:
            'test -f /image-marker && test "$REMOTE_TEST" = yes && test -f "$HOST_WORKSPACE/marker.txt" && cat /image-marker',
          timeout: 10000,
          expectedCode: 0,
        },
      ],
    }),
  )
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, destination)
  await page.getByRole('button', { name: 'Abrir dev container', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral do ambiente' })).toBeVisible()
  await page.evaluate(() => {
    const events: string[] = []
    window.dcbEvents = events
    window.builder.onEvent((event) => events.push(`${event.channel}:${event.kind}:${event.text}`))
  })
  const eventText = () => page.evaluate(() => window.dcbEvents.join('\n'))
  try {
    await page.getByRole('button', { name: 'Testar', exact: true }).click()
    await page.getByRole('button', { name: 'Construir e testar', exact: true }).click()
    await expect.poll(eventText, { timeout: 90000 }).toContain('passed: Runtime check')
    await expect(page.locator('.statusbar')).toContainText('running')
    expect(await fs.readFile(path.join(destination, 'ready.txt'), 'utf8')).toBe('ready')
    await page.locator('.panel-tabs').getByRole('button', { name: 'TERMINAL', exact: true }).click()
    await page.getByRole('button', { name: 'Conectar shell', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Desconectar', exact: true })).toBeVisible()
    const terminal = page.locator('.panel-pane:visible .xterm-helper-textarea')
    await terminal.focus()
    await page.keyboard.type('printf "shell-%s\\n" "$REMOTE_TEST"')
    await page.keyboard.press('Enter')
    await expect.poll(eventText).toContain('shell-yes')
    await page.getByRole('button', { name: 'Desconectar', exact: true }).click()
    await page
      .locator('.outline')
      .getByRole('button', { name: 'Distribuição', exact: true })
      .click()
    await page.getByRole('button', { name: 'Analisar projeto salvo', exact: true }).click()
    await page
      .getByRole('button', { name: 'Selecionar todos os arquivos permitidos', exact: true })
      .click()
    await page.getByRole('checkbox', { name: /Revisei as dependências/ }).check()
    const archive = path.join(root, 'export.zip')
    await application.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: file,
      })) as typeof dialog.showSaveDialog
    }, archive)
    await page.getByRole('button', { name: 'Exportar ZIP', exact: true }).click()
    await expect(page.getByText(`Exportado para: ${archive}`, { exact: true })).toBeVisible()
    const files = unzipSync(await fs.readFile(archive))
    for (const [name, bytes] of Object.entries(files)) {
      if (name.endsWith('/')) continue
      const target = path.join(restored, name)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, bytes)
    }
    expect(await fs.readFile(path.join(restored, '.devcontainer/Dockerfile'), 'utf8')).toContain(
      '# existing production documentation',
    )
    await application.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [directory],
      })) as typeof dialog.showOpenDialog
    }, restored)
    await page.getByRole('button', { name: 'Abrir dev container', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Visão geral do ambiente' })).toBeVisible()
    await page.evaluate(() => {
      window.dcbEvents.length = 0
    })
    await page.getByRole('button', { name: 'Testar', exact: true }).click()
    await page.getByRole('button', { name: 'Construir e testar', exact: true }).click()
    await expect.poll(eventText, { timeout: 90000 }).toContain('passed: Runtime check')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.locator('.panel-tabs').getByRole('button', { name: 'TERMINAL', exact: true }).click()
    await page.getByRole('button', { name: 'Conectar shell', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Desconectar', exact: true })).toBeVisible()
    await page.getByTitle('Parar container').click()
    await expect(page.locator('.statusbar')).toContainText('exited')
    await expect(page.getByRole('button', { name: 'Conectar shell', exact: true })).toBeVisible()
  } finally {
    const client = new Docker({
      socketPath: process.env.DOCKER_HOST?.replace(/^unix:\/\//, '') || '/var/run/docker.sock',
    })
    for (const folder of [destination, restored]) {
      const value = createHash('sha256')
        .update(folder + '\0.devcontainer/devcontainer.json')
        .digest('hex')
        .slice(0, 24)
      const containers = await client.listContainers({
        all: true,
        filters: JSON.stringify({ label: [`devcontainer-builder.project=${value}`] }),
      })
      for (const item of containers)
        await client.getContainer(item.Id).remove({ force: true, v: false })
    }
  }
})

test('private GitHub repository clones into an approved host workspace', async () => {
  test.skip(
    !process.env.DCB_GITHUB_E2E_REPO,
    'Opt in with DCB_GITHUB_E2E_REPO=owner/repo and authenticated gh.',
  )
  const destination = path.join(root, 'private-clone')
  await fs.mkdir(destination)
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, destination)
  const data = {
    ...wizardDefaults(),
    root: destination,
    repository: 'clone' as const,
    repositoryUrl: process.env.DCB_GITHUB_E2E_REPO!,
    image: 'alpine:3.22',
    remoteUser: 'root',
  }
  const result = await page.evaluate(async (data) => {
    await window.builder.projects.pickDirectory()
    return window.builder.projects.create(data)
  }, data)
  expect(result.root).toBe(destination)
  expect(await fs.readFile(path.join(destination, '.git/HEAD'), 'utf8')).toContain(
    'refs/heads/main',
  )
  expect(
    await fs.readFile(path.join(destination, '.devcontainer/devcontainer.json'), 'utf8'),
  ).toContain('dockerfile')
  expect(await fs.readFile(path.join(destination, '.devcontainer/Dockerfile'), 'utf8')).toContain(
    'FROM alpine:3.22',
  )
  expect(await fs.readFile(path.join(destination, '.git/config'), 'utf8')).toContain(
    process.env.DCB_GITHUB_E2E_REPO!,
  )
})

test('theme selection updates the workbench, editor and terminal and survives reload', async () => {
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Tema visual', exact: true })
    .selectOption('light-modern')
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light-modern')
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
    ),
  ).toBe('#ffffff')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light-modern')
  const destination = path.join(root, 'theme-project')
  await fs.mkdir(destination)
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, destination)
  await page.evaluate(
    async (data) => {
      data.root = (await window.builder.projects.pickDirectory()) ?? ''
      await window.builder.projects.create(data)
    },
    { ...wizardDefaults(), root: destination, repository: 'none' as const, image: 'alpine:3.22' },
  )
  await page.getByRole('button', { name: 'Abrir dev container', exact: true }).click()
  await page.getByRole('button', { name: 'Código', exact: true }).click()
  await expect(page.locator('.monaco-editor').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  )
  await expect(page.locator('.xterm-viewport').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  )
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Tema visual', exact: true })
    .selectOption('high-contrast')
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast')
  await expect(page.locator('.xterm-viewport').first()).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  )
})

test('Compose visual changes retain comments and save alongside helper scripts', async () => {
  const destination = path.join(root, 'compose-edit')
  await fs.mkdir(path.join(destination, '.devcontainer'), { recursive: true })
  const yaml =
    '# production deployment\nservices:\n  app:\n    image: alpine:3.22 # pinned\n    command: sleep infinity\n'
  await fs.writeFile(
    path.join(destination, '.devcontainer/devcontainer.json'),
    '{"dockerComposeFile":"compose.yaml","service":"app","workspaceFolder":"/workspace"}',
  )
  await fs.writeFile(path.join(destination, '.devcontainer/compose.yaml'), yaml)
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, destination)
  await page.getByRole('button', { name: 'Abrir dev container', exact: true }).click()
  await page.getByRole('button', { name: 'Compose', exact: true }).click()
  await page.getByLabel('Imagem do serviço', { exact: true }).fill('alpine:3.23')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Salvar alterações revisadas', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const saved = await fs.readFile(path.join(destination, '.devcontainer/compose.yaml'), 'utf8')
  expect(saved).toContain('# production deployment')
  expect(saved).toContain('# pinned')
  expect(saved).toContain('alpine:3.23')
  await page.getByRole('button', { name: 'Repositório', exact: true }).click()
  await page
    .getByRole('button', { name: 'Criar scripts de start/stop/shell ausentes', exact: true })
    .click()
  await expect
    .poll(
      async () =>
        (await fs.readdir(destination)).filter((f) => f.startsWith('devcontainer-')).length,
    )
    .toBe(6)
})

for (const engine of ['docker', 'podman'] as const) {
  test(`${engine}: generated scripts, API shell and volume backup/restore`, async () => {
    test.skip(
      process.env[engine === 'docker' ? 'DCB_DOCKER_E2E' : 'DCB_PODMAN_E2E'] !== '1',
      'Opt into a local engine integration.',
    )
    test.setTimeout(240000)
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execute = promisify(execFile)
    const socket =
      engine === 'docker'
        ? process.env.DOCKER_HOST || 'unix:///var/run/docker.sock'
        : process.env.DCB_PODMAN_SOCKET ||
          `unix://${process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.()}`}/podman/podman.sock`
    const client = new Docker({ socketPath: socket.slice(7) })
    const destination = path.join(root, 'script-workspace')
    await fs.mkdir(destination)
    const suffix = path.basename(root).toLowerCase()
    const volume = 'dcb-' + suffix
    const restoredVolume = volume + '-restored'
    let containerId = ''
    try {
      await application.evaluate(({ dialog }, directory) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [directory],
        })) as typeof dialog.showOpenDialog
      }, destination)
      await page.evaluate(
        async ({ engine, socket, data }) => {
          const settings = await window.builder.settings.get()
          await window.builder.settings.save({ ...settings, engine, dockerEndpoint: socket })
          data.root = (await window.builder.projects.pickDirectory()) ?? ''
          await window.builder.projects.create(data)
        },
        {
          engine,
          socket,
          data: {
            ...wizardDefaults(),
            root: destination,
            repository: 'none' as const,
            image: 'docker.io/library/alpine:3.22',
            remoteUser: 'root',
            workspaceFolder: '/workspace',
          },
        },
      )
      // Use a volume workspace to work with rootless engines and SELinux without relabeling host directories.
      await fs.writeFile(
        path.join(destination, '.devcontainer/devcontainer.json'),
        JSON.stringify({
          image: 'docker.io/library/alpine:3.22',
          workspaceMount: `type=volume,source=${volume},target=/workspace`,
          workspaceFolder: '/workspace',
          remoteUser: 'root',
          postCreateCommand: 'printf backup-ready > /workspace/ready.txt',
        }),
      )
      const env = {
        ...process.env,
        PATH: path.join(process.cwd(), 'node_modules/.bin') + path.delimiter + process.env.PATH,
        DCB_ENGINE: engine,
        DOCKER_HOST: socket,
        CONTAINER_HOST: engine === 'podman' ? socket : '',
      }
      await execute('sh', [path.join(destination, 'devcontainer-start.sh')], {
        env,
        timeout: 180000,
        maxBuffer: 4_000_000,
      })
      await page.getByRole('button', { name: 'Abrir dev container', exact: true }).click()
      const state = await page.evaluate(async () => {
        const s = await window.builder.settings.get()
        const p = await window.builder.projects.openRecent(s.recent[0])
        return { p, state: await window.builder.runtime.state(p.id) }
      })
      containerId = state.state.containerId ?? ''
      expect(containerId).toBeTruthy()
      const command = await execute(
        'sh',
        [
          path.join(destination, 'devcontainer-shell.sh'),
          '/bin/sh',
          '-c',
          'cat /workspace/ready.txt',
        ],
        { env, timeout: 30000 },
      )
      expect(command.stdout).toContain('backup-ready')
      await page.evaluate(async (id) => {
        window.dcbEvents = []
        window.builder.onEvent((e) => window.dcbEvents.push(e.text))
        const session = await window.builder.terminal.open(id)
        await window.builder.terminal.write(session, 'printf terminal-ready\\n\n')
      }, state.p.id)
      await expect
        .poll(() => page.evaluate(() => window.dcbEvents.join('')))
        .toContain('terminal-ready')
      await page.evaluate(async (id) => window.builder.runtime.stop(id), state.p.id)
      expect((await client.getContainer(containerId).inspect()).State.Running).toBe(false)
      const archive = path.join(root, 'volume.tar')
      await application.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = (async () => ({
          canceled: false,
          filePath: file,
        })) as typeof dialog.showSaveDialog
      }, archive)
      expect(
        await page.evaluate((name) => window.builder.maintenance.backupVolume(name), volume),
      ).toBe(archive)
      await application.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [file],
        })) as typeof dialog.showOpenDialog
      }, archive)
      expect(
        await page.evaluate(
          (name) => window.builder.maintenance.restoreVolume(name),
          restoredVolume,
        ),
      ).toBe(restoredVolume)
      const verify = await client.createContainer({
        Image: 'alpine:3.22',
        Cmd: ['cat', '/data/ready.txt'],
        HostConfig: { Mounts: [{ Type: 'volume', Source: restoredVolume, Target: '/data' }] },
      })
      try {
        await verify.start()
        expect((await verify.wait()).StatusCode).toBe(0)
        expect((await verify.logs({ stdout: true })).toString()).toContain('backup-ready')
      } finally {
        await verify.remove({ force: true })
      }
      const restart = await page.evaluate(async (id) => {
        window.dcbEvents = []
        window.builder.onEvent((e) => window.dcbEvents.push(e.id + ':' + e.kind + ':' + e.text))
        return window.builder.runtime.start(id)
      }, state.p.id)
      await expect
        .poll(
          () =>
            page.evaluate(
              (id) =>
                window.dcbEvents.find(
                  (e) => e.startsWith(id + ':done:') || e.startsWith(id + ':error:'),
                ) || '',
              restart,
            ),
          { timeout: 60000 },
        )
        .toContain(':done:')
      await execute('sh', [path.join(destination, 'devcontainer-stop.sh')], { env, timeout: 30000 })
      expect((await client.getContainer(containerId).inspect()).State.Running).toBe(false)
    } finally {
      const containers = await client.listContainers({
        all: true,
        filters: JSON.stringify({ volume: [volume] }),
      })
      for (const c of containers) await client.getContainer(c.Id).remove({ force: true, v: false })
      for (const name of [volume, restoredVolume])
        await client
          .getVolume(name)
          .remove()
          .catch(() => {})
    }
  })
}

test('Compose builds the development service and stops its associated services', async () => {
  test.skip(process.env.DCB_DOCKER_E2E !== '1', 'Opt into Docker integration.')
  test.setTimeout(180000)
  const destination = path.join(root, 'compose-runtime')
  await fs.mkdir(path.join(destination, '.devcontainer'), { recursive: true })
  const volume = 'dcb-compose-' + path.basename(root).toLowerCase()
  await fs.writeFile(
    path.join(destination, '.devcontainer/devcontainer.json'),
    JSON.stringify({
      dockerComposeFile: 'compose.yaml',
      service: 'app',
      workspaceFolder: '/workspace',
      remoteUser: 'root',
    }),
  )
  await fs.writeFile(
    path.join(destination, '.devcontainer/Dockerfile'),
    '# compose build\nFROM alpine:3.22\nRUN echo compose-built > /built\n',
  )
  await fs.writeFile(
    path.join(destination, '.devcontainer/compose.yaml'),
    `services:\n  app:\n    build:\n      context: ..\n      dockerfile: .devcontainer/Dockerfile\n    command: sleep infinity\n    volumes:\n      - workspace:/workspace\n    depends_on:\n      - cache\n  cache:\n    image: alpine:3.22\n    command: sleep infinity\nvolumes:\n  workspace:\n    name: ${volume}\n`,
  )
  const client = new Docker()
  let composeProject = ''
  try {
    await application.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [directory],
      })) as typeof dialog.showOpenDialog
    }, destination)
    const p = await page.evaluate(async () => {
      const p = await window.builder.projects.open()
      if (!p) throw new Error('Missing fixture')
      window.dcbEvents = []
      window.builder.onEvent((e) => window.dcbEvents.push(e.id + ':' + e.kind + ':' + e.text))
      return p
    })
    const operation = await page.evaluate((id) => window.builder.runtime.start(id), p.id)
    await expect
      .poll(
        () =>
          page.evaluate(
            (id) =>
              window.dcbEvents.find(
                (e) => e.startsWith(id + ':done:') || e.startsWith(id + ':error:'),
              ) || '',
            operation,
          ),
        { timeout: 120000 },
      )
      .toContain(':done:')
    const state = await page.evaluate((id) => window.builder.runtime.state(id), p.id)
    expect(state.status).toBe('running')
    const info = await client.getContainer(state.containerId!).inspect()
    composeProject = info.Config.Labels['com.docker.compose.project']
    const services = await client.listContainers({
      filters: JSON.stringify({ label: [`com.docker.compose.project=${composeProject}`] }),
    })
    expect(services).toHaveLength(2)
    await page.evaluate((id) => window.builder.runtime.stop(id), p.id)
    expect(
      await client.listContainers({
        filters: JSON.stringify({ label: [`com.docker.compose.project=${composeProject}`] }),
      }),
    ).toHaveLength(0)
  } finally {
    if (composeProject) {
      for (const c of await client.listContainers({
        all: true,
        filters: JSON.stringify({ label: [`com.docker.compose.project=${composeProject}`] }),
      }))
        await client.getContainer(c.Id).remove({ force: true, v: false })
      for (const n of await client.listNetworks({
        filters: JSON.stringify({ label: [`com.docker.compose.project=${composeProject}`] }),
      }))
        await client.getNetwork(n.Id).remove()
    }
    await client
      .getVolume(volume)
      .remove()
      .catch(() => {})
  }
})

test('creates a private GitHub test remote, commits selected files and pushes', async () => {
  test.skip(
    process.env.DCB_GITHUB_CREATE_E2E !== '1',
    'Opt into disposable private GitHub repository creation and cleanup.',
  )
  test.setTimeout(120000)
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execute = promisify(execFile)
  const destination = path.join(root, 'github-create')
  await fs.mkdir(destination)
  const owner = (await execute('gh', ['api', 'user', '--jq', '.login'])).stdout.trim()
  const permissions = await execute('gh', ['api', '--include', 'user'])
  test.skip(
    !/^x-oauth-scopes:.*delete_repo/im.test(permissions.stdout),
    'OAuth token needs delete_repo scope for disposable repository cleanup.',
  )
  const name = 'dcb-validation-' + path.basename(root).toLowerCase()
  let created = false
  try {
    await application.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [directory],
      })) as typeof dialog.showOpenDialog
    }, destination)
    const p = await page.evaluate(
      async (data) => {
        data.root = (await window.builder.projects.pickDirectory()) ?? ''
        return window.builder.projects.create(data)
      },
      { ...wizardDefaults(), repository: 'local' as const, root: destination },
    )
    await execute('git', [
      '-C',
      destination,
      'config',
      'user.name',
      'DevContainer Builder validation',
    ])
    await execute('git', [
      '-C',
      destination,
      'config',
      'user.email',
      'asantos43@users.noreply.github.com',
    ])
    await page.evaluate(
      async ({ id, owner, name }) => window.builder.git.createRemote(id, owner, name, true),
      { id: p.id, owner, name },
    )
    created = true
    await page.evaluate(async (p) => {
      await window.builder.git.commit(p.id, 'test: validate private project workflow', p.files)
      await window.builder.git.push(p.id)
    }, p)
    const result = await execute('gh', [
      'repo',
      'view',
      `${owner}/${name}`,
      '--json',
      'isPrivate,defaultBranchRef',
    ])
    const repo = JSON.parse(result.stdout)
    expect(repo.isPrivate).toBe(true)
    expect(repo.defaultBranchRef.name).toBe('main')
  } finally {
    if (created) await execute('gh', ['api', '--method', 'DELETE', `repos/${owner}/${name}`])
  }
})

test('OCI template creation and Feature inspection use the bundled CLI without running hooks', async () => {
  test.skip(process.env.DCB_OCI_E2E !== '1', 'Opt into OCI registry downloads.')
  test.setTimeout(180000)
  const destination = path.join(root, 'oci-project')
  await fs.mkdir(destination)
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, destination)
  const project = await page.evaluate(() =>
    window.builder.maintenance.applyTemplate(
      'ghcr.io/devcontainers/templates/javascript-node:1',
      {},
    ),
  )
  expect(project?.root).toBe(destination)
  expect(await fs.readFile(path.join(destination, 'devcontainer-start.sh'), 'utf8')).toContain(
    'devcontainer up',
  )
  expect(
    (await page.evaluate(() => window.builder.settings.get())).recent.every(
      (p) => !p.includes('dcb-template-'),
    ),
  ).toBe(true)
  if (!project) throw new Error('Template project missing.')
  // Templates without Features still exercise the official metadata command.
  expect(
    await page.evaluate((id) => window.builder.maintenance.featureVersions(id), project.id),
  ).toBeDefined()
})

test('Trivy exports real CycloneDX and dependency vulnerability reports', async () => {
  test.skip(process.env.DCB_TRIVY_E2E !== '1', 'Opt into Trivy with database network access.')
  test.setTimeout(240000)
  const destination = path.join(root, 'security-project')
  await fs.mkdir(path.join(destination, '.devcontainer'), { recursive: true })
  await fs.writeFile(
    path.join(destination, '.devcontainer/devcontainer.json'),
    '{"image":"alpine:3.22"}',
  )
  await fs.writeFile(
    path.join(destination, 'package.json'),
    '{"name":"security-fixture","version":"1.0.0","dependencies":{"lodash":"4.17.20"}}',
  )
  await fs.writeFile(
    path.join(destination, 'package-lock.json'),
    JSON.stringify({
      name: 'security-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { lodash: '4.17.20' } },
        'node_modules/lodash': { version: '4.17.20' },
      },
    }),
  )
  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [directory],
    })) as typeof dialog.showOpenDialog
  }, destination)
  const project = await page.evaluate(() => window.builder.projects.open())
  if (!project) throw new Error('Missing fixture')
  for (const kind of ['sbom', 'vulnerabilities'] as const) {
    const file = path.join(root, kind + '.json')
    await application.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: file,
      })) as typeof dialog.showSaveDialog
    }, file)
    expect(
      await page.evaluate(({ id, kind }) => window.builder.maintenance.scan(id, kind), {
        id: project.id,
        kind,
      }),
    ).toBe(file)
    const report = JSON.parse(await fs.readFile(file, 'utf8'))
    if (kind === 'sbom') {
      expect(report.bomFormat).toBe('CycloneDX')
      expect(report.components.some((c: { name: string }) => c.name === 'lodash')).toBe(true)
    } else
      expect(
        report.Results.some(
          (r: { Vulnerabilities?: unknown[] }) => (r.Vulnerabilities?.length ?? 0) > 0,
        ),
      ).toBe(true)
  }
})

test('clones a public repository into a new volume without changing the host workspace', async () => {
  test.skip(
    process.env.DCB_VOLUME_CLONE_E2E !== '1',
    'Opt into public GitHub clone and package downloads.',
  )
  test.setTimeout(120000)
  const client = new Docker()
  const volume = 'dcb-clone-' + path.basename(root).toLowerCase()
  try {
    expect(
      await page.evaluate(
        (name) =>
          window.builder.maintenance.cloneVolume(
            name,
            'https://github.com/octocat/Hello-World.git',
            'master',
          ),
        volume,
      ),
    ).toBe(volume)
    const container = await client.createContainer({
      Image: 'alpine:3.22',
      Cmd: ['cat', '/data/repository/README'],
      HostConfig: { Mounts: [{ Type: 'volume', Source: volume, Target: '/data', ReadOnly: true }] },
    })
    try {
      await container.start()
      expect((await container.wait()).StatusCode).toBe(0)
      expect((await container.logs({ stdout: true })).toString()).toContain('Hello World')
    } finally {
      await container.remove({ force: true, v: false })
    }
  } finally {
    await client
      .getVolume(volume)
      .remove()
      .catch(() => {})
  }
})
