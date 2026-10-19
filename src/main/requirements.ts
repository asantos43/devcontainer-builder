// SPDX-License-Identifier: MPL-2.0
import os from 'node:os'
import fs from 'node:fs/promises'
import { app } from 'electron'
import { hostProblems, requirements, versionAtLeast, type HostFacts } from '../shared/requirements'
import { getSettings } from './settings'
import { docker, engineRun } from './engine'
import type { Capability } from '../shared/types'
export function hostFacts(): HostFacts {
  const report = process.report?.getReport() as
    { header?: { glibcVersionRuntime?: string } } | undefined
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    memory: os.totalmem(),
    glibc: report?.header?.glibcVersionRuntime,
  }
}
export async function systemRequirements(): Promise<Capability[]> {
  const problems = hostProblems(hostFacts())
  const result: Capability[] = [
    {
      name: 'Application system requirements',
      ok: !problems.length,
      detail: problems.join('\n') || 'Supported OS/architecture, glibc and at least 2 GiB RAM.',
    },
  ]
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    const stat = await fs.statfs(app.getPath('userData'))
    const free = stat.bavail * stat.bsize
    result.push({
      name: 'Application storage',
      ok: free >= requirements.diskBytes,
      detail: `${Math.floor(free / 1024 ** 2)} MiB free; reserve at least 1 GiB for the application. Container images/workspaces need additional space.`,
    })
  } catch {
    result.push({
      name: 'Application storage',
      ok: false,
      detail: 'The application data directory must be writable.',
    })
  }
  return result
}
export async function assertContainerRequirements(): Promise<void> {
  const { engine } = await getSettings()
  try {
    const version = await engineRun(['version', '--format', '{{.Client.Version}}'])
    const value = version.stdout.trim().replace(/^v/, '')
    if (!versionAtLeast(value, requirements.engine[engine]))
      throw new Error(`${engine} ${requirements.engine[engine]}+ is required; found ${value}.`)
    const info = await (await docker()).info()
    if (info.OSType && info.OSType !== 'linux')
      throw new Error(
        'Select Linux containers in Docker Desktop. Windows container images are unsupported.',
      )
  } catch (e) {
    throw new Error(
      `Container prerequisites are not satisfied. Install/start ${engine}, select Linux containers and verify Settings → Check tools & engine. ${String(e)}`,
    )
  }
}
