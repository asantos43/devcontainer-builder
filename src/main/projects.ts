// SPDX-License-Identifier: MPL-2.0
import { dialog } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createConfig, readConfig, validateConfig } from '../shared/config'
import { inside, exclusionReason } from '../shared/paths'
import type { Auxiliary, Project, WizardData } from '../shared/types'
import { run, tracked, type Operation } from './operations'
import { remember } from './settings'

const projects = new Map<string, Project>()
const selectedDirectories = new Set<string>()
export function projectFor(id: string): Project {
  const p = projects.get(id)
  if (!p) throw new Error('Project is not open.')
  return p
}
export function updateProject(p: Project): void {
  projects.set(p.id, p)
}
export async function checkedPath(
  root: string,
  candidate: string,
  allowMissing = false,
): Promise<string> {
  const full = path.resolve(root, candidate)
  if (!inside(root, full))
    throw new Error('Path is outside the selected project. Open its parent folder instead.')
  let cursor = full
  while (true) {
    try {
      const real = await fs.realpath(cursor)
      if (!inside(await fs.realpath(root), real))
        throw new Error('Symlink escapes the selected project.')
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || !allowMissing) throw e
      const parent = path.dirname(cursor)
      if (parent === cursor) throw e
      cursor = parent
    }
  }
  return full
}
async function readOptional(file: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw e
  }
}
async function exists(filename: string): Promise<boolean> {
  try {
    await fs.lstat(filename)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
async function configurations(root: string): Promise<string[]> {
  const candidates: string[] = []
  for (const candidate of ['.devcontainer/devcontainer.json', '.devcontainer.json']) {
    const full = await checkedPath(root, candidate, true)
    if (await exists(full)) candidates.push(candidate)
  }
  const directory = await checkedPath(root, '.devcontainer', true)
  if (await exists(directory)) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const candidate = `.devcontainer/${entry.name}/devcontainer.json`
      if (await exists(await checkedPath(root, candidate, true))) candidates.push(candidate)
    }
  }
  return candidates
}
export async function listFiles(root: string, prefix = '', depth = 0): Promise<string[]> {
  if (depth > 15) return []
  const out: string[] = []
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink() || exclusionReason(relative)) continue
    if (entry.isDirectory()) out.push(...(await listFiles(root, relative, depth + 1)))
    else if (entry.isFile()) out.push(relative)
    if (out.length > 10000)
      throw new Error('Project has more than 10,000 exportable files; choose a smaller root.')
  }
  return out.sort()
}
export async function pickDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  const selected = await fs.realpath(result.filePaths[0])
  selectedDirectories.add(selected)
  return selected
}
export async function loadProject(
  root: string,
  configFile?: string,
  id?: string,
): Promise<Project> {
  root = await fs.realpath(root)
  let configPath = configFile
  if (!configPath) {
    const candidates = await configurations(root)
    if (!candidates.length) throw new Error('No devcontainer.json found in this folder.')
    if (candidates.length > 1) {
      const result = await dialog.showMessageBox({
        type: 'question',
        message: 'Choose a Dev Container configuration / Escolha uma configuração',
        buttons: [...candidates, 'Cancel / Cancelar'],
        cancelId: candidates.length,
      })
      if (result.response === candidates.length) throw new Error('Cancelled.')
      configPath = candidates[result.response]
    } else configPath = candidates[0]
  }
  const configFull = await checkedPath(root, configPath)
  const configText = await fs.readFile(configFull, 'utf8')
  const { config, errors } = readConfig(configText)
  const previous = id ? projects.get(id) : undefined
  const build =
    config.build && typeof config.build === 'object'
      ? (config.build as Record<string, unknown>)
      : {}
  const dockerfileReference =
    errors.length && previous?.dockerfilePath
      ? path.relative(path.dirname(configFull), path.resolve(root, previous.dockerfilePath))
      : typeof build.dockerfile === 'string'
        ? build.dockerfile
        : typeof config.dockerFile === 'string'
          ? config.dockerFile
          : undefined
  let dockerfilePath: string | undefined
  let dockerfile = ''
  if (dockerfileReference) {
    const full = await checkedPath(
      root,
      path.resolve(path.dirname(configFull), dockerfileReference),
      true,
    )
    dockerfilePath = path.relative(root, full).split(path.sep).join('/')
    dockerfile = await readOptional(full)
  }
  const auxiliaryPath = path.join(path.dirname(configFull), 'builder.json')
  await checkedPath(root, auxiliaryPath, true)
  const auxiliaryText = await readOptional(auxiliaryPath)
  let auxiliary: Auxiliary = { version: 1, tests: [] }
  if (auxiliaryText) {
    const parsed = JSON.parse(auxiliaryText)
    if (parsed.version !== 1 || !Array.isArray(parsed.tests))
      throw new Error('Unsupported builder.json format.')
    auxiliary = parsed
  }
  const p: Project = {
    id: id ?? randomUUID(),
    root,
    configPath: path.relative(root, configFull).split(path.sep).join('/'),
    dockerfilePath,
    configText,
    dockerfile,
    auxiliary,
    files: await listFiles(root),
    baseline: { configText, dockerfile, auxiliaryText },
  }
  projects.set(p.id, p)
  await remember(root)
  return p
}
export async function openProject(): Promise<Project | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'Dev Container', extensions: ['json', 'jsonc'] }],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const selected = result.filePaths[0]
  const stat = await fs.stat(selected)
  if (stat.isDirectory()) return loadProject(selected)
  const parent = path.dirname(selected)
  const root =
    path.basename(parent) === '.devcontainer'
      ? path.dirname(parent)
      : path.basename(path.dirname(parent)) === '.devcontainer'
        ? path.dirname(path.dirname(parent))
        : parent
  return loadProject(root, selected)
}
export async function hasChanged(id: string): Promise<boolean> {
  const p = projectFor(id)
  const config = await readOptional(await checkedPath(p.root, p.configPath, true))
  const dockerfile = p.dockerfilePath
    ? await readOptional(await checkedPath(p.root, p.dockerfilePath, true))
    : ''
  const aux = await readOptional(
    await checkedPath(p.root, path.join(path.dirname(p.configPath), 'builder.json'), true),
  )
  return (
    config !== p.baseline.configText ||
    dockerfile !== p.baseline.dockerfile ||
    aux !== p.baseline.auxiliaryText
  )
}
export async function atomicWrite(filename: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filename), { recursive: true })
  let mode = 0o644
  try {
    mode = (await fs.stat(filename)).mode
  } catch {
    /* new file */
  }
  const temp = `${filename}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temp, text, { mode })
    await fs.rename(temp, filename)
  } catch (e) {
    await fs.rm(temp, { force: true })
    throw e
  }
}
export async function saveProject(incoming: Project): Promise<Project> {
  const p = projectFor(incoming.id)
  if (await hasChanged(p.id))
    throw new Error(
      'Files changed on disk. Reload before saving to avoid overwriting external edits.',
    )
  const { config, errors } = readConfig(incoming.configText)
  const build =
    config.build && typeof config.build === 'object'
      ? (config.build as Record<string, unknown>)
      : {}
  const ref =
    typeof build.dockerfile === 'string'
      ? build.dockerfile
      : typeof config.dockerFile === 'string'
        ? config.dockerFile
        : undefined
  const dockerfilePath = errors.length
    ? p.dockerfilePath
    : ref
      ? path
          .relative(p.root, path.resolve(p.root, path.dirname(p.configPath), ref))
          .split(path.sep)
          .join('/')
      : undefined
  if (
    dockerfilePath !== p.dockerfilePath &&
    dockerfilePath &&
    (await exists(await checkedPath(p.root, dockerfilePath, true)))
  )
    throw new Error(
      'The new Dockerfile path already exists. Reopen the configuration to load it before editing.',
    )
  const writes: [string, string][] = [
    [p.configPath, incoming.configText],
    [
      path.join(path.dirname(p.configPath), 'builder.json'),
      JSON.stringify(incoming.auxiliary, null, 2) + '\n',
    ],
  ]
  if (dockerfilePath) writes.push([dockerfilePath, incoming.dockerfile])
  const targets = await Promise.all(
    writes.map(async ([file, text]) => ({ file: await checkedPath(p.root, file, true), text })),
  )
  const applied: { file: string; text: string; existed: boolean }[] = []
  try {
    for (const { file, text } of targets) {
      const previous = await readOptional(file)
      if (previous === text) continue
      const existed = await exists(file)
      await atomicWrite(file, text)
      applied.push({ file, text: previous, existed })
    }
  } catch (error) {
    for (const previous of applied.reverse()) {
      if (previous.existed) await atomicWrite(previous.file, previous.text)
      else await fs.rm(previous.file, { force: true })
    }
    throw error
  }
  return loadProject(p.root, p.configPath, p.id)
}
export async function saveAs(p: Project): Promise<Project | null> {
  projectFor(p.id)
  const target = await pickDirectory()
  if (!target) return null
  if ((await fs.readdir(target)).length)
    throw new Error('Save As needs an empty destination folder.')
  const original = projectFor(p.id)
  for (const file of await listFiles(original.root)) {
    const source = await checkedPath(original.root, file)
    const destination = await checkedPath(target, file, true)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(source, destination)
  }
  const copy = await loadProject(target, original.configPath)
  return saveProject({
    ...copy,
    configText: p.configText,
    dockerfile: p.dockerfile,
    auxiliary: p.auxiliary,
  })
}
export async function createProject(data: WizardData): Promise<Project> {
  return tracked('git', (op) => createProjectInternal(data, op))
}
async function createProjectInternal(data: WizardData, op: Operation): Promise<Project> {
  if (!selectedDirectories.has(await fs.realpath(data.root)))
    throw new Error('Select the project folder with the directory picker first.')
  if (!data.name.trim() || !data.image.trim() || !data.workspaceFolder.startsWith('/'))
    throw new Error('Name, image and absolute workspace path are required.')
  if (/[,\r\n]/.test(data.root))
    throw new Error('Workspace path cannot contain commas or newlines.')
  const text = createConfig(data)
  const errors = validateConfig(text).filter((d) => d.level === 'error')
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'))
  const root = await fs.realpath(data.root)
  const configFull = await checkedPath(root, '.devcontainer/devcontainer.json', true)
  if ((await configurations(root)).length)
    throw new Error('This folder already has a Dev Container. Open it instead.')
  if (
    data.base === 'dockerfile' &&
    (await exists(await checkedPath(root, '.devcontainer/Dockerfile', true)))
  )
    throw new Error('Dockerfile already exists; open the project to preserve it.')
  const output = op.output
  if (data.repository === 'clone') {
    if ((await fs.readdir(root)).length) throw new Error('Clone needs an empty destination folder.')
    const args = ['clone', data.repositoryUrl, root]
    if (data.branch) args.push('--', '--branch', data.branch)
    await run('gh', ['repo', ...args], { output, signal: op.signal, timeout: 600000 })
    await checkedPath(root, configFull, true)
    if ((await configurations(root)).length) return loadProject(root)
  }
  if (data.repository === 'local' || data.repository === 'github') {
    const existing = await run('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      allowFailure: true,
    })
    if (!existing.code && path.resolve(existing.stdout.trim()) !== root)
      throw new Error(
        'Folder belongs to a parent repository. Select its root or another destination.',
      )
    if (existing.code)
      await run('git', ['init', '-b', data.branch || 'main'], {
        cwd: root,
        output,
        signal: op.signal,
      })
  }
  if (data.repository === 'existing')
    await run('git', ['rev-parse', '--show-toplevel'], { cwd: root })
  if (data.repository === 'github') {
    const name = data.githubOwner ? `${data.githubOwner}/${data.githubName}` : data.githubName
    if (!name || name.startsWith('-')) throw new Error('GitHub repository name is required.')
    await run(
      'gh',
      [
        'repo',
        'create',
        name,
        data.githubPrivate ? '--private' : '--public',
        '--source',
        root,
        '--remote',
        'origin',
        '--description',
        data.description,
      ],
      { cwd: root, output, signal: op.signal },
    )
  }
  op.signal.throwIfAborted()
  // Never overwrite files that appeared while cloning or creating a remote.
  await checkedPath(root, configFull, true)
  if ((await configurations(root)).length) return loadProject(root)
  if (
    data.base === 'dockerfile' &&
    (await exists(await checkedPath(root, '.devcontainer/Dockerfile', true)))
  )
    throw new Error(
      'Dockerfile already exists after clone; open or rename it before creating configuration.',
    )
  await atomicWrite(configFull, text)
  if (data.base === 'dockerfile')
    await atomicWrite(
      await checkedPath(root, '.devcontainer/Dockerfile', true),
      `# Development image\nFROM ${data.image}\n\n# Add project-specific build steps below.\n`,
    )
  const auxPath = await checkedPath(root, '.devcontainer/builder.json', true)
  if (!(await exists(auxPath)))
    await atomicWrite(auxPath, JSON.stringify({ version: 1, tests: [] }, null, 2) + '\n')
  const ignore = await checkedPath(root, '.dockerignore', true)
  if (!(await exists(ignore)))
    await atomicWrite(ignore, '.git\nnode_modules\n.env\n.env.*\n!.env.example\n*.pem\n*.key\n')
  return loadProject(root)
}
