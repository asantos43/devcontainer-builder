// SPDX-License-Identifier: MPL-2.0
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import archiver from 'archiver'
import { dialog } from 'electron'
import { readConfig, parseMount } from '../shared/config'
import { safeArchivePath, exclusionReason, inside } from '../shared/paths'
import type { ExportPlan } from '../shared/types'
import { checkedPath, listFiles, projectFor } from './projects'

export async function exportPlan(id: string): Promise<ExportPlan> {
  const p = projectFor(id)
  const files = await listFiles(p.root)
  const entries = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(await checkedPath(p.root, file))
      return { path: file, size: stat.size, excluded: false }
    }),
  )
  const dependencies: string[] = []
  const { config } = readConfig(p.configText)
  const build =
    config.build && typeof config.build === 'object'
      ? (config.build as Record<string, unknown>)
      : {}
  const context = path.resolve(p.root, path.dirname(p.configPath), String(build.context ?? '.'))
  if (config.build && !inside(p.root, context))
    dependencies.push(
      `Build context is outside the project: ${context}. Select a larger project root before exporting.`,
    )
  for (const line of p.dockerfile.split(/\r?\n/))
    if (/^\s*(COPY|ADD)\s/i.test(line)) {
      if (/\$|\*|\?|--from|\\\s*$/.test(line))
        dependencies.push(`Review dynamic/multistage dependency: ${line.trim()}`)
      else
        dependencies.push(
          `Include build inputs from ${path.relative(p.root, context) || '.'}: ${line.trim()}`,
        )
    }
  for (const raw of [
    ...(Array.isArray(config.mounts) ? config.mounts : []),
    ...(config.workspaceMount ? [config.workspaceMount] : []),
  ]) {
    const m = parseMount(raw)
    if (m?.type === 'volume')
      dependencies.push(
        `Volume ${m.source}: only its mount configuration is exported, not its contents.`,
      )
    else if (m?.type === 'bind' && !m.source.includes('${localWorkspaceFolder}'))
      dependencies.push(`Host folder requires remapping on another machine: ${m.source}`)
  }
  for (const hook of [
    'initializeCommand',
    'onCreateCommand',
    'updateContentCommand',
    'postCreateCommand',
    'postStartCommand',
    'postAttachCommand',
  ])
    if (config[hook]) dependencies.push(`Review scripts/files referenced by ${hook}.`)
  return { entries, dependencies }
}
export async function exportZip(id: string, selected: string[]): Promise<string | null> {
  const p = projectFor(id)
  const plan = await exportPlan(id)
  const available = new Set(plan.entries.map((e) => e.path))
  const configFiles = [p.configPath, p.dockerfilePath].filter((v): v is string => Boolean(v))
  for (const required of configFiles)
    if (!selected.includes(required)) throw new Error(`Required export file: ${required}`)
  const entries = await Promise.all(
    [...new Set(selected)].map(async (relative) => {
      if (!safeArchivePath(relative) || !available.has(relative) || exclusionReason(relative))
        throw new Error('Invalid or excluded export file.')
      const full = await checkedPath(p.root, relative)
      const stat = await fs.lstat(full)
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('Only regular files may be exported.')
      return { relative, full, mode: stat.mode }
    }),
  )
  const response = await dialog.showSaveDialog({
    defaultPath: `${path.basename(p.root)}-devcontainer.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  })
  if (response.canceled || !response.filePath) return null
  if (inside(p.root, response.filePath) && entries.some((e) => e.full === response.filePath))
    throw new Error('Archive cannot overwrite a selected source file.')
  const temporary = response.filePath + '.partial'
  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(temporary)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', resolve)
      output.on('error', reject)
      archive.on('error', reject)
      archive.on('warning', reject)
      archive.pipe(output)
      for (const entry of entries)
        archive.file(entry.full, { name: entry.relative, mode: entry.mode })
      archive.append(
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            files: entries.map((e) => e.relative),
            dependencies: plan.dependencies,
            portable: plan.dependencies.length === 0,
          },
          null,
          2,
        ),
        { name: 'DEVCONTAINER-EXPORT.json' },
      )
      archive.append(
        '# Dev Container export\n\nExtract all files together. Open this folder in VS Code with Dev Containers or run:\n\n    devcontainer up --workspace-folder . --config ' +
          p.configPath +
          '\n\nReview DEVCONTAINER-EXPORT.json for dependencies, host paths and volumes. Volume data and Git history are not included.\n',
        { name: 'DEVCONTAINER-EXPORT.md' },
      )
      void archive.finalize().catch(reject)
    })
    await fs.rename(temporary, response.filePath)
    return response.filePath
  } catch (e) {
    await fs.rm(temporary, { force: true })
    throw e
  }
}
