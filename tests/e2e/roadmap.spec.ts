// SPDX-License-Identifier: MPL-2.0
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { createHash } from 'node:crypto'
import Docker from 'dockerode'
let app: ElectronApplication, page: Page, root: string
const errors: string[] = []
test.beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-roadmap-'))
  app = await electron.launch({
    args: ['out/main/index.js'],
    env: Object.fromEntries(
      Object.entries({
        ...process.env,
        DCB_E2E: '1',
        DCB_E2E_USER_DATA: path.join(root, 'settings'),
        DOCKER_CONFIG: path.join(root, 'auth'),
      }).filter(([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && typeof value === 'string'),
    ) as Record<string, string>,
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  errors.length = 0
  page.on('pageerror', (e) => errors.push(e.message))
})
test.afterEach(async () => {
  await app?.close()
  await fs.rm(root, { recursive: true, force: true })
})
async function choose(filename: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [file],
    })) as typeof dialog.showOpenDialog
  }, filename)
}
async function library() {
  await page.getByRole('button', { name: 'Templates e importação', exact: true }).click()
}
async function destination(folder: string) {
  await fs.mkdir(folder, { recursive: true })
  await choose(folder)
  await page.getByRole('button', { name: 'Escolher destino para revisão', exact: true }).click()
  await expect(page.getByText(folder, { exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: /Revisei os arquivos/ }).check()
}
async function apply() {
  await page.getByRole('button', { name: 'Criar e abrir para ajuste fino', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Visão geral do ambiente' })).toBeVisible()
}
async function fixture(name: string) {
  const folder = path.join(root, name)
  await fs.mkdir(path.join(folder, '.devcontainer'), { recursive: true })
  const config =
    '// production JSONC note\n{"name":"Existing","build":{"dockerfile":"Dockerfile"},"initializeCommand":"touch NEVER_RUN","unknown":{"keep":true}}\n'
  await fs.writeFile(path.join(folder, '.devcontainer/devcontainer.json'), config)
  await fs.writeFile(
    path.join(folder, '.devcontainer/Dockerfile'),
    '# production comment\nFROM alpine:3.22\n',
  )
  await fs.writeFile(path.join(folder, '.env'), 'SECRET=excluded')
  return { folder, config }
}
test('template wizard configures a palette project and installs local AI Feature files on save', async () => {
  await page.getByRole('button', { name: 'Novo dev container', exact: true }).last().click()
  await page
    .getByRole('button', {
      name: 'Usar um template ou importar um Dev Container existente',
      exact: true,
    })
    .click()
  await page.getByLabel('Pesquisar templates').fill('Rust')
  await page.getByText('Rust', { exact: true }).click()
  await page.getByRole('button', { name: 'Pré-visualizar origem', exact: true }).click()
  await page.getByLabel('Project name', { exact: true }).fill('Rust team')
  const target = path.join(root, 'rust')
  await destination(target)
  await apply()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Rust team')
  await page
    .locator('.configuration-nav')
    .getByRole('button', { name: 'Features', exact: true })
    .click()
  for (const name of ['Claude Code', 'Codex CLI', 'OpenCode'])
    await page.getByRole('checkbox', { name, exact: true }).check()
  await page.getByTitle('Salvar alterações', { exact: true }).click()
  await page.getByRole('button', { name: 'Salvar alterações revisadas', exact: true }).click()
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible()
  const json = await fs.readFile(path.join(target, '.devcontainer/devcontainer.json'), 'utf8')
  expect(json).toContain('./builder-ai-tools')
  const feature = JSON.parse(
    await fs.readFile(
      path.join(target, '.devcontainer/builder-ai-tools/devcontainer-feature.json'),
      'utf8',
    ),
  )
  expect(feature.dependsOn['ghcr.io/devcontainers/features/node:1'].version).toBe('22')
  const install = await fs.readFile(
    path.join(target, '.devcontainer/builder-ai-tools/install.sh'),
    'utf8',
  )
  for (const name of ['@anthropic-ai/claude-code', '@openai/codex', 'opencode-ai'])
    expect(install).toContain(name)
  expect(errors).toEqual([])
})
test('folder import preserves comments, saves a reusable template and never executes hooks', async () => {
  const source = await fixture('source')
  await library()
  await page.getByLabel('Origem do template').selectOption('folder')
  await choose(source.folder)
  await page.getByRole('button', { name: 'Pré-visualizar origem', exact: true }).click()
  await page.getByLabel('Nome do template', { exact: true }).fill('Team template')
  await page.getByRole('button', { name: 'Salvar template reutilizável', exact: true }).click()
  await expect(page.getByText('Template salvo na biblioteca local.', { exact: true })).toBeVisible()
  const target = path.join(root, 'imported')
  await destination(target)
  await apply()
  expect(await fs.readFile(path.join(target, '.devcontainer/devcontainer.json'), 'utf8')).toBe(
    source.config,
  )
  expect(await fs.readdir(target)).not.toContain('NEVER_RUN')
  expect(await fs.readdir(target)).not.toContain('.env')
  expect((await page.evaluate(() => window.builder.library.list()))[0].name).toBe('Team template')
  expect(errors).toEqual([])
})
test('ZIP import previews files, rejects overwrite and opens an empty reviewed destination', async () => {
  const source = path.join(root, 'project.zip')
  await fs.writeFile(
    source,
    zipSync({
      'repo/.devcontainer/devcontainer.json': strToU8('// zip note\n{"image":"alpine:3.22"}'),
      'repo/.env': strToU8('SECRET=excluded'),
    }),
  )
  await library()
  await page.getByLabel('Origem do template').selectOption('zip')
  await choose(source)
  await page.getByRole('button', { name: 'Pré-visualizar origem', exact: true }).click()
  const target = path.join(root, 'conflict')
  await fs.mkdir(path.join(target, '.devcontainer'), { recursive: true })
  await fs.writeFile(path.join(target, '.devcontainer/devcontainer.json'), 'unchanged')
  await destination(target)
  await expect(
    page.getByRole('button', { name: 'Criar e abrir para ajuste fino', exact: true }),
  ).toBeDisabled()
  expect(await fs.readFile(path.join(target, '.devcontainer/devcontainer.json'), 'utf8')).toBe(
    'unchanged',
  )
  const empty = path.join(root, 'empty')
  await destination(empty)
  await apply()
  expect(await fs.readFile(path.join(empty, '.devcontainer/devcontainer.json'), 'utf8')).toContain(
    '// zip note',
  )
  expect(await fs.readdir(empty)).not.toContain('.env')
  expect(errors).toEqual([])
})
test('VSIX theme applies palette and TextMate grammar without executing extension code', async () => {
  const source = await fixture('source')
  await choose(source.folder)
  await page.getByRole('button', { name: 'Abrir dev container', exact: true }).click()
  const vsix = path.join(root, 'theme.vsix')
  await fs.writeFile(
    vsix,
    zipSync({
      'extension/package.json': strToU8(
        JSON.stringify({
          main: './evil.js',
          contributes: {
            themes: [{ label: 'Team VSIX', path: './theme.json', uiTheme: 'vs-dark' }],
            grammars: [
              { language: 'dockerfile', scopeName: 'source.dockerfile', path: './dockerfile.json' },
            ],
          },
        }),
      ),
      'extension/theme.json': strToU8(
        JSON.stringify({
          colors: {
            'editor.background': '#142536',
            'sideBar.background': '#112233',
            'terminal.background': '#101122',
          },
          tokenColors: [
            { scope: 'keyword.control.dockerfile', settings: { foreground: '#ff9900' } },
          ],
        }),
      ),
      'extension/dockerfile.json': strToU8(
        JSON.stringify({
          scopeName: 'source.dockerfile',
          patterns: [{ name: 'keyword.control.dockerfile', match: '^FROM\\b' }],
        }),
      ),
      'extension/evil.js': strToU8('throw new Error("EXTENSION_CODE_MUST_NOT_RUN")'),
    }),
  )
  await page.getByRole('button', { name: 'Configurações', exact: true }).click()
  await choose(vsix)
  await page
    .getByRole('button', { name: 'Importar tema do VS Code JSON/VSIX', exact: true })
    .click()
  await expect(page.getByLabel('Tema visual')).toHaveValue(/custom-/)
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
      ),
    )
    .toBe('#142536')
  await page
    .locator('.configuration-nav')
    .getByRole('button', { name: 'Dockerfile', exact: true })
    .click()
  await page.locator('.segmented').getByRole('button', { name: 'Código', exact: true }).click()
  await expect
    .poll(() =>
      page
        .locator('.view-line span')
        .evaluateAll((spans) =>
          spans
            .filter((e) => e.textContent === 'FROM')
            .some((e) => getComputedStyle(e).color === 'rgb(255, 153, 0)'),
        ),
    )
    .toBe(true)
  expect(errors).toEqual([])
})
test('private GitHub clone forwards credentials into an ephemeral container without persisting them', async () => {
  test.skip(
    !process.env.DCB_GITHUB_E2E_REPO || process.env.DCB_PRIVATE_VOLUME_E2E !== '1',
    'Opt in with a private repository and local Docker.',
  )
  test.setTimeout(180000)
  const name = 'dcb-private-' + path.basename(root).toLowerCase()
  const client = new Docker({
    socketPath: process.env.DOCKER_HOST?.replace(/^unix:\/\//, '') || '/var/run/docker.sock',
  })
  try {
    expect(
      await page.evaluate(
        async ({ name, repo }) =>
          window.builder.maintenance.cloneVolume(
            name,
            'https://github.com/' + repo + '.git',
            'main',
            'github-cli',
          ),
        { name, repo: process.env.DCB_GITHUB_E2E_REPO! },
      ),
    ).toBe(name)
    const verify = await client.createContainer({
      Image: 'alpine:3.22',
      Cmd: [
        'sh',
        '-c',
        'test -d /data/repository/.git && ! grep -Eq "gh[pousr]_|github_pat_|x-access-token@" /data/repository/.git/config && test ! -e /run/dcb/token',
      ],
      HostConfig: { Mounts: [{ Type: 'volume', Source: name, Target: '/data', ReadOnly: true }] },
    })
    try {
      await verify.start()
      expect((await verify.wait()).StatusCode).toBe(0)
    } finally {
      await verify.remove({ force: true })
    }
  } finally {
    await client
      .getVolume(name)
      .remove()
      .catch(() => {})
  }
})
test('AI tools Feature builds and exposes all three CLIs', async () => {
  test.skip(process.env.DCB_AI_E2E !== '1', 'Opt into Docker/network-backed Feature installation.')
  test.setTimeout(600000)
  const folder = path.join(root, 'ai-project')
  await fs.mkdir(folder)
  await choose(folder)
  const { wizardDefaults } = await import('../../src/shared/config')
  const p = await page.evaluate(
    async (data) => {
      data.root = (await window.builder.projects.pickDirectory())!
      return window.builder.projects.create(data)
    },
    {
      ...wizardDefaults(),
      root: folder,
      repository: 'none' as const,
      base: 'image' as const,
      image: 'mcr.microsoft.com/devcontainers/base:ubuntu',
      features: { './builder-ai-tools': { claude: true, codex: true, opencode: true } },
    },
  )
  const events: string[] = []
  await page.exposeFunction('aiEvent', (text: string) => events.push(text))
  await page.evaluate(() =>
    window.builder.onEvent((e) =>
      (window as unknown as { aiEvent: (text: string) => void }).aiEvent(e.kind + ':' + e.text),
    ),
  )
  const client = new Docker({
    socketPath: process.env.DOCKER_HOST?.replace(/^unix:\/\//, '') || '/var/run/docker.sock',
  })
  try {
    await page.evaluate((id) => window.builder.runtime.start(id), p.id)
    await expect
      .poll(() => events.some((e) => e.startsWith('done:') || e.startsWith('error:')), {
        timeout: 540000,
      })
      .toBe(true)
    expect(
      events.filter((e) => e.startsWith('error:')).join('\n'),
      events.join('\n').slice(-12000),
    ).toBe('')
    expect(events.join('\n')).toContain('done:Completed.')
    const state = await page.evaluate((id) => window.builder.runtime.state(id), p.id)
    expect(state.status).toBe('running')
    const exec = await client.getContainer(state.containerId!).exec({
      Cmd: ['sh', '-c', 'claude --version && codex --version && opencode --version'],
      AttachStdout: true,
      AttachStderr: true,
      User: 'vscode',
    })
    const stream = await exec.start({})
    stream.resume()
    await new Promise<void>((resolve) => stream.once('end', resolve))
    expect((await exec.inspect()).ExitCode).toBe(0)
  } finally {
    const label = createHash('sha256')
      .update(folder + '\0.devcontainer/devcontainer.json')
      .digest('hex')
      .slice(0, 24)
    for (const item of await client.listContainers({
      all: true,
      filters: JSON.stringify({ label: ['devcontainer-builder.project=' + label] }),
    }))
      await client.getContainer(item.Id).remove({ force: true, v: false })
  }
})

test('Trivy scans the built image without running project hooks', async () => {
  test.skip(process.env.DCB_IMAGE_SCAN_E2E !== '1', 'Opt in with local Docker and host Trivy.')
  test.setTimeout(180000)
  const source = await fixture('image-scan')
  await choose(source.folder)
  const p = await page.evaluate(() => window.builder.projects.open())
  const client = new Docker({
    socketPath: process.env.DOCKER_HOST?.replace(/^unix:\/\//, '') || '/var/run/docker.sock',
  })
  const label = createHash('sha256')
    .update(source.folder + '\0.devcontainer/devcontainer.json')
    .digest('hex')
    .slice(0, 24)
  const container = await client.createContainer({
    Image: 'alpine:3.22',
    Cmd: ['sleep', 'infinity'],
    Labels: { 'devcontainer-builder.project': label },
  })
  const report = path.join(root, 'image-sbom.json')
  try {
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: file,
      })) as typeof dialog.showSaveDialog
    }, report)
    expect(
      await page.evaluate((id) => window.builder.maintenance.scan(id, 'sbom', 'image'), p!.id),
    ).toBe(report)
    const data = JSON.parse(await fs.readFile(report, 'utf8'))
    expect(data.bomFormat).toBe('CycloneDX')
    expect(data.components.length).toBeGreaterThan(0)
    expect((await container.inspect()).State.Running).toBe(false)
    expect(await fs.readdir(source.folder)).not.toContain('NEVER_RUN')
  } finally {
    await container.remove({ force: true, v: false })
  }
})
