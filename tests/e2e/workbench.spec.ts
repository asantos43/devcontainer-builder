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
      }).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && typeof value === 'string'),
    ) as Record<string, string>,
  })
  page = await application.firstWindow()
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
          command: 'test -f /image-marker && test "$REMOTE_TEST" = yes && cat /image-marker',
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
