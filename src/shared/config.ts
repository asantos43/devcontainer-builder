// SPDX-License-Identifier: MPL-2.0
import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from 'jsonc-parser'
import type { Config, Diagnostic, Mount, WizardData } from './types'

export function readConfig(text: string): { config: Config; errors: Diagnostic[] } {
  const errors: ParseError[] = []
  const value = parse(text, errors, { allowTrailingComma: true })
  const diagnostics: Diagnostic[] = errors.map((e) => ({
    level: 'error',
    message: `${printParseErrorCode(e.error)} @ ${e.offset}`,
  }))
  if (!value || Array.isArray(value) || typeof value !== 'object')
    diagnostics.push({ level: 'error', message: 'Configuration must be a JSON object.' })
  return {
    config: value && typeof value === 'object' && !Array.isArray(value) ? value : {},
    errors: diagnostics,
  }
}
export function patchConfig(text: string, path: (string | number)[], value: unknown): string {
  if (readConfig(text).errors.length) throw new Error('Fix JSONC syntax before visual editing.')
  return applyEdits(
    text,
    modify(text, path, value, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
        eol: text.includes('\r\n') ? '\r\n' : '\n',
      },
    }),
  )
}
export function mountString(m: Mount): string {
  if ([m.source, m.target].some((s) => /[,\r\n]/.test(s)))
    throw new Error('Mount paths cannot contain commas or newlines.')
  if (!m.source.trim() || !m.target.startsWith('/'))
    throw new Error('A mount needs a source and an absolute container path.')
  if (m.type === 'volume' && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(m.source))
    throw new Error('Invalid Docker volume name.')
  return `type=${m.type},source=${m.source},target=${m.target}${m.readOnly ? ',readonly' : ''}`
}
export function parseMount(value: unknown): Mount | null {
  if (typeof value === 'object' && value) {
    const m = value as Record<string, unknown>
    if (
      (m.type === 'bind' || m.type === 'volume') &&
      typeof m.source === 'string' &&
      typeof m.target === 'string'
    )
      return { type: m.type, source: m.source, target: m.target, readOnly: m.readOnly === true }
    return null
  }
  if (typeof value !== 'string') return null
  const parts = Object.fromEntries(
    value.split(',').map((s) => {
      const i = s.indexOf('=')
      return i < 0 ? [s, 'true'] : [s.slice(0, i), s.slice(i + 1)]
    }),
  )
  if ((parts.type !== 'bind' && parts.type !== 'volume') || !parts.source || !parts.target)
    return null
  return {
    type: parts.type,
    source: parts.source,
    target: parts.target,
    readOnly: parts.readonly === 'true' || parts.ro === 'true',
  }
}
export function validateConfig(text: string): Diagnostic[] {
  const { config: c, errors } = readConfig(text)
  if (errors.length) return errors
  const d: Diagnostic[] = []
  if (c.dockerComposeFile)
    d.push({ level: 'error', message: 'Compose is available as source only in this version.' })
  const sources = [Boolean(c.image), Boolean(c.build), Boolean(c.dockerFile)].filter(Boolean).length
  if (sources !== 1 && !c.dockerComposeFile)
    d.push({ level: 'error', message: 'Select exactly one base: image or Dockerfile build.' })
  for (const key of ['name', 'image', 'remoteUser', 'workspaceFolder', 'workspaceMount'])
    if (c[key] !== undefined && typeof c[key] !== 'string')
      d.push({ level: 'error', message: `${key} must be a string.` })
  if (
    c.workspaceFolder &&
    (typeof c.workspaceFolder !== 'string' || !c.workspaceFolder.startsWith('/'))
  )
    d.push({ level: 'error', message: 'workspaceFolder must be an absolute container path.' })
  if (
    c.build !== undefined &&
    (!c.build ||
      typeof c.build !== 'object' ||
      Array.isArray(c.build) ||
      typeof (c.build as Config).dockerfile !== 'string')
  )
    d.push({ level: 'error', message: 'build.dockerfile must be a string.' })
  if (
    c.forwardPorts !== undefined &&
    (!Array.isArray(c.forwardPorts) ||
      c.forwardPorts.some(
        (p) =>
          !(Number.isInteger(p) && Number(p) > 0 && Number(p) <= 65535) &&
          !(typeof p === 'string' && /^[\w.-]+:\d+$/.test(p)),
      ))
  )
    d.push({ level: 'error', message: 'Invalid forwardPorts.' })
  for (const key of ['features', 'containerEnv', 'remoteEnv'])
    if (c[key] !== undefined && (!c[key] || typeof c[key] !== 'object' || Array.isArray(c[key])))
      d.push({ level: 'error', message: `${key} must be an object.` })
  if (
    c.runArgs !== undefined &&
    (!Array.isArray(c.runArgs) || c.runArgs.some((a) => typeof a !== 'string'))
  )
    d.push({ level: 'error', message: 'runArgs must contain strings.' })
  if (c.mounts !== undefined && !Array.isArray(c.mounts))
    d.push({ level: 'error', message: 'mounts must be an array.' })
  const allMounts: unknown[] = [
    ...(Array.isArray(c.mounts) ? c.mounts : []),
    ...(c.workspaceMount ? [c.workspaceMount] : []),
  ]
  const destinations: string[] = []
  for (const raw of allMounts) {
    const m = parseMount(raw)
    if (!m) {
      d.push({ level: 'warning', message: 'Advanced mount: inspect it in the source editor.' })
      continue
    }
    try {
      mountString(m)
    } catch (e) {
      d.push({ level: 'error', message: String(e) })
    }
    const target = m.target.replace(/\/+$/, '') || '/'
    if (destinations.some((t) => target === t))
      d.push({ level: 'error', message: `Duplicate mount destination: ${target}` })
    else if (
      destinations.some(
        (t) =>
          target.startsWith(t + '/') || t.startsWith(target + '/') || target === '/' || t === '/',
      )
    )
      d.push({
        level: 'warning',
        message: `Nested mount hides files from another mount: ${target}. Review this mapping.`,
      })
    destinations.push(target)
  }
  if (
    c.forwardPorts &&
    !(
      Array.isArray(c.runArgs) &&
      c.runArgs.some((a) => a === '-p' || String(a).startsWith('--publish'))
    )
  )
    d.push({
      level: 'warning',
      message:
        'forwardPorts is IDE metadata. Publish ports explicitly for access from this application.',
    })
  return d
}
export function createConfig(data: WizardData): string {
  const config: Config = {
    name: data.name,
    ...(data.base === 'image'
      ? { image: data.image }
      : { build: { dockerfile: 'Dockerfile', context: '..' } }),
    workspaceMount: 'type=bind,source=${localWorkspaceFolder},target=' + data.workspaceFolder,
    workspaceFolder: data.workspaceFolder,
    remoteUser: data.remoteUser || 'root',
    ...(Object.keys(data.features).length ? { features: data.features } : {}),
    ...(data.mounts.length ? { mounts: data.mounts.map(mountString) } : {}),
    ...(data.ports.length ? { forwardPorts: data.ports } : {}),
    ...(Object.keys(data.env).length ? { containerEnv: data.env } : {}),
    ...(data.postCreateCommand ? { postCreateCommand: data.postCreateCommand } : {}),
  }
  return '// Created with DevContainer Builder\n' + JSON.stringify(config, null, 2) + '\n'
}
export const features = [
  { id: 'ghcr.io/devcontainers/features/common-utils:2', name: 'Common utilities', options: {} },
  { id: 'ghcr.io/devcontainers/features/node:1', name: 'Node.js', options: { version: 'lts' } },
  { id: 'ghcr.io/devcontainers/features/python:1', name: 'Python', options: { version: '3.12' } },
  { id: 'ghcr.io/devcontainers/features/git:1', name: 'Git', options: {} },
  { id: 'ghcr.io/devcontainers/features/github-cli:1', name: 'GitHub CLI', options: {} },
  {
    id: 'ghcr.io/devcontainers/features/docker-outside-of-docker:1',
    name: 'Docker outside of Docker',
    options: {},
  },
]
export const templates = {
  empty: { image: 'mcr.microsoft.com/devcontainers/base:ubuntu', remoteUser: 'vscode' },
  node: {
    image: 'mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm',
    remoteUser: 'node',
  },
  python: { image: 'mcr.microsoft.com/devcontainers/python:1-3.12-bookworm', remoteUser: 'vscode' },
  ubuntu: { image: 'ubuntu:24.04', remoteUser: 'root' },
}
export function wizardDefaults(): WizardData {
  return {
    name: 'my-devcontainer',
    root: '',
    template: 'empty',
    repository: 'local',
    repositoryUrl: '',
    branch: 'main',
    githubOwner: '',
    githubName: '',
    githubPrivate: true,
    description: '',
    base: 'dockerfile',
    image: templates.empty.image,
    remoteUser: templates.empty.remoteUser,
    workspaceFolder: '/workspaces/my-devcontainer',
    features: {},
    mounts: [],
    ports: [],
    env: {},
    postCreateCommand: '',
  }
}
