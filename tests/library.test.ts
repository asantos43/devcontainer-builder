// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
const mocks = vi.hoisted(() => ({ data: '', source: '', open: vi.fn(), cli: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: () => mocks.data },
  dialog: { showOpenDialog: mocks.open, showMessageBox: vi.fn() },
}))
vi.mock('../src/main/runtime', () => ({ cli: mocks.cli }))
vi.mock('../src/main/settings', () => ({
  remember: vi.fn(),
  getSettings: async () => ({
    engine: 'docker',
    dockerEndpoint: '',
    tlsCertPath: '',
    composePath: '',
  }),
}))
import { readZip } from '../src/main/archives'
import {
  previewSource,
  prepareDestination,
  applyPreview,
  saveTemplate,
  listTemplates,
  snapshotFolder,
  publishTemplate,
} from '../src/main/library'
import { templateCatalog } from '../src/shared/catalog'
let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-library-'))
  mocks.data = path.join(root, 'preferences')
  mocks.open.mockReset()
  mocks.cli.mockReset()
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})
async function choose(directory: string) {
  await fs.mkdir(directory, { recursive: true })
  mocks.open.mockResolvedValue({ canceled: false, filePaths: [directory] })
}
async function source() {
  const folder = path.join(root, 'source')
  await fs.mkdir(path.join(folder, '.devcontainer'), { recursive: true })
  const config =
    '// production note\n{"build":{"dockerfile":"Dockerfile"},"unknown":{"preserve":true},"initializeCommand":"touch SHOULD_NOT_RUN"}\n'
  await fs.writeFile(path.join(folder, '.devcontainer/devcontainer.json'), config)
  await fs.writeFile(
    path.join(folder, '.devcontainer/Dockerfile'),
    '# production Dockerfile\nFROM alpine:3.22\n',
  )
  await fs.writeFile(path.join(folder, '.env'), 'API_TOKEN=secret')
  await fs.writeFile(path.join(folder, 'devcontainer-start.sh'), '#!/bin/sh\n# team helper\n')
  return { folder, config }
}
describe('template previews and imports', () => {
  it('preserves saved configuration/comments/helpers and excludes credentials without running hooks', async () => {
    const { folder, config } = await source()
    await choose(folder)
    const preview = (await previewSource({ kind: 'folder' }))!
    expect(preview.excluded).toContain('.env')
    const target = path.join(root, 'destination')
    await choose(target)
    const destination = (await prepareDestination(preview.id))!
    expect(destination.conflicts).toEqual([])
    const p = await applyPreview(preview.id, destination.id, preview.configurations[0], {})
    expect(p.configText).toBe(config)
    expect(p.dockerfile).toContain('# production Dockerfile')
    expect(await fs.readFile(path.join(target, 'devcontainer-start.sh'), 'utf8')).toContain(
      '# team helper',
    )
    expect(await fs.readdir(target)).not.toContain('SHOULD_NOT_RUN')
    expect(await fs.readdir(target)).not.toContain('.env')
  })
  it('rechecks destination conflicts and rolls back only newly written files', async () => {
    const { folder } = await source()
    await choose(folder)
    const preview = (await previewSource({ kind: 'folder' }))!
    const target = path.join(root, 'destination')
    await choose(target)
    const d = (await prepareDestination(preview.id))!
    await fs.mkdir(path.join(target, '.devcontainer'), { recursive: true })
    await fs.writeFile(path.join(target, '.devcontainer/devcontainer.json'), 'existing bytes')
    await expect(applyPreview(preview.id, d.id, preview.configurations[0], {})).rejects.toThrow()
    expect(await fs.readFile(path.join(target, '.devcontainer/devcontainer.json'), 'utf8')).toBe(
      'existing bytes',
    )
    expect(await fs.readdir(target)).toEqual(['.devcontainer'])
  })
  it('imports a wrapped ZIP and saves/reopens a reusable template', async () => {
    const file = path.join(root, 'source.zip')
    await fs.writeFile(
      file,
      zipSync({
        'repository/.devcontainer/devcontainer.json': strToU8('{"image":"alpine:3.22"}'),
        'repository/.env': strToU8('secret'),
      }),
    )
    mocks.open.mockResolvedValue({ canceled: false, filePaths: [file] })
    const preview = (await previewSource({ kind: 'zip' }))!
    expect(preview.configurations).toEqual(['.devcontainer/devcontainer.json'])
    const id = await saveTemplate(preview.id, 'Team template', 'Preserve our setup')
    expect(await listTemplates()).toContainEqual({
      id,
      name: 'Team template',
      description: 'Preserve our setup',
    })
    const saved = (await previewSource({ kind: 'saved', reference: id }))!
    expect(saved.name).toBe('Team template')
    expect(saved.files.some((f) => f.path.includes('.env'))).toBe(false)
  })
  it.each(templateCatalog.map((t) => t.id))(
    'previews common development template %s and applies options',
    async (id) => {
      const preview = (await previewSource({ kind: 'catalog', reference: id }))!
      const target = path.join(root, id)
      await choose(target)
      const d = (await prepareDestination(preview.id))!
      const p = await applyPreview(preview.id, d.id, preview.configurations[0], {
        name: 'Team "quoted" ' + id,
      })
      expect(p.configText).toContain('Team \\"quoted\\"')
      expect(p.configText).not.toContain('${templateOption:')
      if (id === 'compose')
        expect(Object.values(p.composeFiles ?? {}).join('')).toContain('postgres:17')
    },
  )
  it('rejects unreviewed destinations, malformed options and symlink escapes', async () => {
    const preview = (await previewSource({ kind: 'catalog', reference: 'node' }))!
    await expect(
      applyPreview(preview.id, 'arbitrary', preview.configurations[0], {}),
    ).rejects.toThrow('review a destination')
    await choose(path.join(root, 'destination'))
    const d = (await prepareDestination(preview.id))!
    await expect(
      applyPreview(preview.id, d.id, preview.configurations[0], { name: 'bad\noption' }),
    ).rejects.toThrow('Invalid template option')
    const { folder } = await source()
    await fs.symlink(root, path.join(folder, 'escape'))
    expect((await snapshotFolder(folder)).excluded).toContain('escape')
  })
  it('publishes only a reviewed snapshot using OCI auth hardening', async () => {
    const preview = (await previewSource({ kind: 'catalog', reference: 'node' }))!
    mocks.cli.mockImplementation(async (args: string[]) => {
      expect(args).toContain('--oci-auth-hardening')
      expect(args).toContain('team/templates')
      return 'Published'
    })
    expect(await publishTemplate(preview.id, 'ghcr.io', 'team/templates')).toBe('Published')
  })
})
describe('ZIP validation', () => {
  it.each(['../escape', '/absolute', 'a/../escape', 'C:/escape', 'folder/file:stream', 'CON.txt'])(
    'rejects nonportable or escaping entry %s',
    async (name) => {
      const file = path.join(root, 'invalid.zip')
      await fs.writeFile(file, zipSync({ [name]: strToU8('x') }))
      await expect(readZip(file)).rejects.toThrow()
    },
  )
  it('rejects case collisions and oversized decompressed entries', async () => {
    const file = path.join(root, 'invalid.zip')
    await fs.writeFile(file, zipSync({ A: strToU8('one'), a: strToU8('two') }))
    await expect(readZip(file)).rejects.toThrow('duplicate')
    const bytes = Buffer.from(zipSync({ huge: strToU8('small') }))
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    bytes.writeUInt32LE(70 * 1024 * 1024, central + 24)
    await fs.writeFile(file, bytes)
    await expect(readZip(file)).rejects.toThrow()
  })
})

it('loads a local Git template at an explicit commit/subfolder without running hooks', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const git = promisify(execFile)
  const repository = path.join(root, 'git-source'),
    template = path.join(repository, 'templates/team/.devcontainer')
  await fs.mkdir(template, { recursive: true })
  await fs.writeFile(
    path.join(template, 'devcontainer.json'),
    '// committed template\n{"image":"alpine:3.22","initializeCommand":"touch NEVER_RUN"}',
  )
  await git('git', ['init', '-b', 'main', repository])
  await git('git', ['add', '.'], { cwd: repository })
  await git(
    'git',
    [
      '-c',
      'user.name=Validation',
      '-c',
      'user.email=validation@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-m',
      'fixture',
    ],
    { cwd: repository },
  )
  const commit = (await git('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim()
  await choose(repository)
  const preview = (await previewSource({
    kind: 'git',
    revision: commit,
    subfolder: 'templates/team',
  }))!
  expect(preview.configurations).toEqual(['.devcontainer/devcontainer.json'])
  expect(await fs.readdir(repository)).not.toContain('NEVER_RUN')
})
