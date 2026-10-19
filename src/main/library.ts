// SPDX-License-Identifier: MPL-2.0
import { app, dialog } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../shared/config'
import {
  templateCatalog,
  type ImportSource,
  type TemplatePreview,
  type ImportDestination,
} from '../shared/catalog'
import { exclusionReason } from '../shared/paths'
import { portablePath, readZip, archiveLimits } from './archives'
import {
  checkedPath,
  loadProject,
  pickDirectory,
  projectFor,
  createHelperScripts,
} from './projects'
import { run, tracked } from './operations'
import { cli } from './runtime'

type Snapshot = { files: Map<string, Buffer>; preview: TemplatePreview; time: number }
const reviews = new Map<string, Snapshot>()
const destinations = new Map<string, { review: string; root: string }>()
const storage = () => path.join(app.getPath('userData'), 'templates')
export async function snapshotFolder(
  root: string,
): Promise<{ files: Map<string, Buffer>; excluded: string[] }> {
  root = await fs.realpath(root)
  const files = new Map<string, Buffer>(),
    excluded: string[] = [],
    names = new Set<string>()
  let total = 0
  async function visit(prefix = '', depth = 0): Promise<void> {
    if (depth > 20) throw new Error('Template exceeds the maximum directory depth.')
    for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
      const name = prefix ? prefix + '/' + entry.name : entry.name
      if (exclusionReason(name) || entry.isSymbolicLink()) {
        excluded.push(name)
        continue
      }
      if (!portablePath(name)) throw new Error('Non-portable template path: ' + name)
      const full = await checkedPath(root, name)
      if (entry.isDirectory()) await visit(name, depth + 1)
      else if (entry.isFile()) {
        const stat = await fs.stat(full)
        total += stat.size
        if (
          stat.size > archiveLimits.file ||
          total > archiveLimits.total ||
          files.size >= archiveLimits.entries
        )
          throw new Error('Template exceeds import size/file limits.')
        const key = name.normalize('NFC').toLowerCase()
        if (names.has(key)) throw new Error('Duplicate portable path: ' + name)
        names.add(key)
        files.set(name, await fs.readFile(full))
      }
    }
  }
  await visit()
  return { files, excluded }
}
function configurations(files: Map<string, Buffer>): string[] {
  return [...files.keys()]
    .filter(
      (name) =>
        /(^|\/)\.devcontainer\/(?:[^/]+\/)?devcontainer\.json$/.test(name) ||
        /(^|\/)\.devcontainer\.json$/.test(name),
    )
    .sort()
}
function stage(
  files: Map<string, Buffer>,
  excluded: string[] = [],
  description = '',
): TemplatePreview {
  // Strip a single archive wrapper directory (e.g. a downloaded GitHub repository).
  if (
    !files.has('.devcontainer.json') &&
    ![...files.keys()].some((f) => f.startsWith('.devcontainer/'))
  ) {
    const first = [...files.keys()][0]?.split('/')[0]
    if (first && [...files.keys()].every((f) => f.startsWith(first + '/')))
      files = new Map([...files].map(([name, data]) => [name.slice(first.length + 1), data]))
  }
  const configs = configurations(files)
  if (!configs.length)
    throw new Error('No Dev Container configuration found in the selected template/subfolder.')
  const metadata = files.get('devcontainer-template.json')
  const parsed = metadata ? readConfig(metadata.toString('utf8')) : { config: {}, errors: [] }
  if (parsed.errors.length) throw new Error('Invalid template metadata.')
  const options: TemplatePreview['options'] = {}
  for (const [key, value] of Object.entries(
    (parsed.config.options ?? {}) as Record<string, unknown>,
  )) {
    if (!/^[a-zA-Z][\w-]{0,63}$/.test(key) || !value || typeof value !== 'object')
      throw new Error('Invalid template option: ' + key)
    const v = value as Record<string, unknown>
    options[key] = {
      description: String(v.description ?? key),
      default: String(v.default ?? ''),
      ...(v.type === 'boolean'
        ? { enum: ['true', 'false'] }
        : Array.isArray(v.enum)
          ? { enum: v.enum.map(String) }
          : {}),
    }
  }
  const preview: TemplatePreview = {
    id: randomUUID(),
    name: String(parsed.config.name ?? 'Dev Container'),
    description: String(parsed.config.description ?? description),
    prerequisites: String(
      parsed.config.prerequisites ??
        'Docker/Podman; review Features, mounts and lifecycle scripts before execution.',
    ),
    configurations: configs,
    files: [...files].map(([name, data]) => ({ path: name, size: data.length })),
    excluded,
    options,
  }
  for (const [id, r] of reviews) if (Date.now() - r.time > 30 * 60 * 1000) reviews.delete(id)
  let total = [...files.values()].reduce((n, b) => n + b.length, 0)
  for (const r of reviews.values()) total += r.preview.files.reduce((n, f) => n + f.size, 0)
  while ((reviews.size >= 4 || total > archiveLimits.total) && reviews.size) {
    const [id, r] = reviews.entries().next().value!
    total -= r.preview.files.reduce((n, f) => n + f.size, 0)
    reviews.delete(id)
  }
  reviews.set(preview.id, { files, preview, time: Date.now() })
  return preview
}
function review(id: string): Snapshot {
  const value = reviews.get(id)
  if (!value || Date.now() - value.time > 30 * 60 * 1000)
    throw new Error('Template preview expired. Preview it again.')
  return value
}
export async function listTemplates(): Promise<
  { id: string; name: string; description: string }[]
> {
  await fs.mkdir(storage(), { recursive: true, mode: 0o700 })
  const result = []
  for (const id of await fs.readdir(storage())) {
    if (!/^[a-f0-9-]{36}$/.test(id)) continue
    try {
      const metadata = JSON.parse(
        await fs.readFile(path.join(storage(), id, 'devcontainer-template.json'), 'utf8'),
      )
      result.push({
        id,
        name: String(metadata.name),
        description: String(metadata.description ?? ''),
      })
    } catch {
      /* incomplete directories are not templates */
    }
  }
  return result
}
export async function previewSource(source: ImportSource): Promise<TemplatePreview | null> {
  if (source.kind === 'catalog') {
    const item = templateCatalog.find((t) => t.id === source.reference)
    if (!item) throw new Error('Unknown catalog template.')
    const files = new Map<string, Buffer>()
    const config = {
      name: '${templateOption:name}',
      ...(item.compose
        ? { dockerComposeFile: 'compose.yaml', service: 'app' }
        : { image: '${templateOption:image}' }),
      remoteUser: item.user,
      workspaceFolder: '/workspace',
      ...(!item.compose
        ? { workspaceMount: 'type=bind,source=${localWorkspaceFolder},target=/workspace' }
        : {}),
    }
    files.set(
      '.devcontainer/devcontainer.json',
      Buffer.from(
        '// Created from the DevContainer Builder palette\n' +
          JSON.stringify(config, null, 2) +
          '\n',
      ),
    )
    files.set(
      'devcontainer-template.json',
      Buffer.from(
        JSON.stringify(
          {
            id: item.id,
            version: '1.0.0',
            name: item.name,
            description: item.description,
            prerequisites: item.prerequisites,
            options: {
              name: { type: 'string', default: 'my-' + item.id, description: 'Project name' },
              image: { type: 'string', default: item.image, description: 'Base image reference' },
            },
          },
          null,
          2,
        ),
      ),
    )
    if (item.compose)
      files.set(
        '.devcontainer/compose.yaml',
        Buffer.from(
          'services:\n  app:\n    image: "${templateOption:image}"\n    command: sleep infinity\n    volumes:\n      - ..:/workspace\n    depends_on:\n      - database\n  database:\n    image: postgres:17\n    environment:\n      POSTGRES_DB: development\n      POSTGRES_USER: development\n      POSTGRES_PASSWORD: local-development-only\n    volumes:\n      - database-data:/var/lib/postgresql/data\nvolumes:\n  database-data:\n',
        ),
      )
    return stage(files)
  }
  if (source.kind === 'zip') {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Dev Container ZIP', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const excluded: string[] = []
    const files = await readZip(result.filePaths[0], (name) => {
      if (exclusionReason(name)) {
        excluded.push(name)
        return false
      }
      return true
    })
    return stage(files, excluded)
  }
  if (source.kind === 'git') {
    const url = source.reference ?? ''
    const local = !url ? await pickDirectory() : null
    if (!url && !local) return null
    if (url) {
      const u = new URL(url)
      if (
        !['https:', 'ssh:'].includes(u.protocol) ||
        u.password ||
        (u.protocol === 'https:' && u.username) ||
        u.search ||
        u.hash
      )
        throw new Error('Use an HTTPS/SSH repository URL without embedded credentials.')
    }
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-git-template-'))
    try {
      return await tracked('git', async (op) => {
        const checkout = path.join(temporary, 'repository')
        const safe = [
          '-c',
          'core.hooksPath=' + path.join(temporary, 'no-hooks'),
          '-c',
          'core.fsmonitor=false',
          '-c',
          'protocol.ext.allow=never',
        ]
        await run(
          'git',
          [...safe, 'clone', '--no-local', '--no-checkout', '--', url || local!, checkout],
          { signal: op.signal, timeout: 600000, output: op.output },
        )
        const revision = source.revision || 'HEAD'
        if (revision.startsWith('-') || /[\r\n\0]/.test(revision))
          throw new Error('Invalid repository revision.')
        await run('git', [...safe, 'fetch', '--depth=1', 'origin', revision], {
          cwd: checkout,
          signal: op.signal,
          timeout: 600000,
          output: op.output,
        })
        await run('git', [...safe, 'checkout', '--detach', 'FETCH_HEAD'], {
          cwd: checkout,
          signal: op.signal,
          output: op.output,
        })
        const folder = await checkedPath(checkout, source.subfolder || '.')
        const result = await snapshotFolder(folder)
        return stage(result.files, result.excluded, 'Repository revision: ' + revision)
      })
    } finally {
      await fs.rm(temporary, { recursive: true, force: true })
    }
  }
  const root =
    source.kind === 'saved' ? path.join(storage(), source.reference || '') : await pickDirectory()
  if (!root) return null
  if (source.kind === 'saved' && !/^[a-f0-9-]{36}$/.test(source.reference || ''))
    throw new Error('Unknown saved template.')
  const result = await snapshotFolder(await checkedPath(root, source.subfolder || '.'))
  return stage(result.files, result.excluded)
}
export async function previewProject(id: string): Promise<TemplatePreview> {
  const p = projectFor(id),
    snapshot = await snapshotFolder(p.root)
  return stage(snapshot.files, snapshot.excluded, 'Created from saved project files.')
}
export async function prepareDestination(id: string): Promise<ImportDestination | null> {
  const r = review(id),
    root = await pickDirectory()
  if (!root) return null
  const conflicts = []
  for (const f of r.preview.files) {
    try {
      await fs.lstat(await checkedPath(root, f.path, true))
      conflicts.push(f.path)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  const token = randomUUID()
  if (destinations.size > 20) destinations.clear()
  destinations.set(token, { review: id, root })
  return { id: token, path: root, conflicts }
}
function substitute(name: string, buffer: Buffer, options: Record<string, string>): Buffer {
  if (!/\.(jsonc?|ya?ml|sh|ps1|md|txt|env|toml)$|(^|\/)Dockerfile[^/]*$/i.test(name)) return buffer
  const text = buffer.toString('utf8')
  return Buffer.from(
    text.replace(/\$\{templateOption:([\w-]+)\}/g, (_match, key: string) => {
      if (!(key in options)) throw new Error('Missing template option: ' + key)
      const value = options[key]
      return /\.jsonc?$/.test(name) ? JSON.stringify(value).slice(1, -1) : value
    }),
  )
}
export async function applyPreview(
  id: string,
  destinationId: string,
  config: string,
  options: Record<string, string>,
) {
  const r = review(id),
    destination = destinations.get(destinationId)
  if (!destination || destination.review !== id)
    throw new Error('Choose and review a destination first.')
  if (!r.preview.configurations.includes(config))
    throw new Error('Choose a previewed Dev Container configuration.')
  const values: Record<string, string> = {}
  for (const [key, meta] of Object.entries(r.preview.options)) {
    const value = options[key] ?? meta.default ?? ''
    if (value.length > 4096 || /[\r\n\0]/.test(value) || (meta.enum && !meta.enum.includes(value)))
      throw new Error('Invalid template option: ' + key)
    values[key] = value
  }
  const written: string[] = []
  try {
    for (const [name, buffer] of r.files) {
      const file = await checkedPath(destination.root, name, true)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, substitute(name, buffer, values), {
        flag: 'wx',
        mode: /\.(sh)$/.test(name) ? 0o755 : 0o644,
      })
      written.push(file)
    }
    const p = await loadProject(destination.root, config)
    await createHelperScripts(p.id)
    destinations.delete(destinationId)
    return loadProject(p.root, p.configPath, p.id)
  } catch (e) {
    for (const file of written.reverse()) await fs.rm(file, { force: true })
    throw e
  }
}
export async function saveTemplate(id: string, name: string, description: string): Promise<string> {
  const r = review(id),
    key = randomUUID(),
    root = path.join(storage(), key)
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  try {
    for (const [file, data] of r.files) {
      const full = path.join(root, file)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, data, { flag: 'wx' })
    }
    const previous = r.files.get('devcontainer-template.json')
    const metadata = previous ? readConfig(previous.toString()).config : {}
    await fs.writeFile(
      path.join(root, 'devcontainer-template.json'),
      JSON.stringify(
        { ...metadata, id: 'template-' + key.slice(0, 8), version: '1.0.0', name, description },
        null,
        2,
      ),
    )
    return key
  } catch (e) {
    await fs.rm(root, { recursive: true, force: true })
    throw e
  }
}
export async function publishTemplate(
  id: string,
  registry: string,
  namespace: string,
): Promise<string> {
  const r = review(id)
  if (!r.files.has('devcontainer-template.json'))
    throw new Error(
      'Save this preview as a named template and preview it from Saved templates before publishing.',
    )
  const metadata = readConfig(r.files.get('devcontainer-template.json')!.toString()).config
  if (typeof metadata.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(metadata.id))
    throw new Error('Template metadata requires a lowercase OCI id.')
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-publish-'))
  try {
    for (const [file, data] of r.files) {
      const target = path.join(staging, 'src', metadata.id, file)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, data)
    }
    return await tracked('build', (op) =>
      cli(
        [
          'templates',
          'publish',
          path.join(staging, 'src'),
          '--registry',
          registry,
          '--namespace',
          namespace,
          '--oci-auth-hardening',
        ],
        staging,
        op,
      ),
    )
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
}
