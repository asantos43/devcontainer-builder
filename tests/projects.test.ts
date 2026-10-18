// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
const mocks = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  showMessageBox: vi.fn(),
  remember: vi.fn(),
}))
vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: mocks.showSaveDialog,
    showMessageBox: mocks.showMessageBox,
    showOpenDialog: vi.fn(),
  },
}))
vi.mock('../src/main/settings', () => ({ remember: mocks.remember }))
import { checkedPath, hasChanged, loadProject, saveProject } from '../src/main/projects'
import { exportPlan, exportZip } from '../src/main/export'
let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-tests-'))
  await fs.mkdir(path.join(root, '.devcontainer'))
  await fs.writeFile(
    path.join(root, '.devcontainer/devcontainer.json'),
    '// team\n{"name":"Existing","build":{"dockerfile":"Dockerfile","context":".."},"custom":{"keep":true}}\n',
  )
  await fs.writeFile(
    path.join(root, '.devcontainer/Dockerfile'),
    '# syntax=docker/dockerfile:1\n# production note\nFROM alpine:3.22\n',
  )
  mocks.showSaveDialog.mockReset()
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})
describe('existing projects and exports', () => {
  it('opens and saves existing Dockerfiles without losing bytes', async () => {
    const p = await loadProject(root)
    const saved = await saveProject(p)
    expect(saved.dockerfile).toBe(p.dockerfile)
    expect(saved.configText).toBe(p.configText)
    expect(saved.configText).toContain('"custom"')
  })
  it('opens an empty existing configuration for source repair', async () => {
    await fs.writeFile(path.join(root, '.devcontainer/devcontainer.json'), '')
    const project = await loadProject(root)
    expect(project.configText).toBe('')
  })
  it('detects external changes and refuses stale saves', async () => {
    const p = await loadProject(root)
    await fs.appendFile(path.join(root, p.configPath), '// external\n')
    expect(await hasChanged(p.id)).toBe(true)
    await expect(
      saveProject({ ...p, configText: p.configText.replace('Existing', 'Changed') }),
    ).rejects.toThrow('changed on disk')
  })
  it('rejects symlinks outside the selected root', async () => {
    await fs.symlink(os.tmpdir(), path.join(root, 'escape'))
    await expect(checkedPath(root, 'escape/private', true)).rejects.toThrow('Symlink')
  })
  it('does not overwrite an existing newly referenced Dockerfile', async () => {
    const p = await loadProject(root)
    await fs.writeFile(path.join(root, '.devcontainer/Other'), 'FROM ubuntu\n')
    await expect(
      saveProject({ ...p, configText: p.configText.replace('Dockerfile', 'Other') }),
    ).rejects.toThrow('already exists')
  })
  it('preserves the attached Dockerfile while saving temporarily invalid JSONC', async () => {
    const project = await loadProject(root)
    const saved = await saveProject({
      ...project,
      configText: '{ invalid',
      dockerfile: project.dockerfile + '# retained edit\n',
    })
    expect(saved.dockerfile).toContain('# retained edit')
    expect(saved.dockerfilePath).toBe(project.dockerfilePath)
  })
  it('rolls back earlier file writes when a later file cannot be saved', async () => {
    const project = await loadProject(root)
    const rename = fs.rename.bind(fs)
    const failure = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('builder.json')) throw new Error('Simulated disk failure')
      return rename(from, to)
    })
    try {
      await expect(
        saveProject({ ...project, configText: project.configText.replace('Existing', 'Changed') }),
      ).rejects.toThrow('disk failure')
      expect(await fs.readFile(path.join(root, project.configPath), 'utf8')).toBe(
        project.configText,
      )
    } finally {
      failure.mockRestore()
    }
  })
  it('filters sensitive files and flags external mounts and build inputs', async () => {
    const p = await loadProject(root)
    await fs.writeFile(path.join(root, '.env'), 'SECRET=value')
    await fs.writeFile(path.join(root, '.env.example'), 'EXAMPLE=')
    await fs.mkdir(path.join(root, '.git'))
    await fs.writeFile(path.join(root, '.git/config'), 'secret')
    const plan = await exportPlan(p.id)
    expect(plan.entries.map((e) => e.path)).toContain('.env.example')
    expect(plan.entries.some((e) => e.path === '.env' || e.path.startsWith('.git/'))).toBe(false)
  })
  it('exports regular selected files with a manifest, and rejects traversal', async () => {
    const p = await loadProject(root)
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: path.join(root, 'export.zip'),
    })
    await exportZip(p.id, [p.configPath, p.dockerfilePath!])
    const archive = await fs.readFile(path.join(root, 'export.zip'))
    expect(archive.subarray(0, 2).toString()).toBe('PK')
    expect(archive.toString('latin1')).toContain('DEVCONTAINER-EXPORT.json')
    await expect(exportZip(p.id, [p.configPath, p.dockerfilePath!, '../secret'])).rejects.toThrow()
  })
})
