// SPDX-License-Identifier: MPL-2.0
export interface HostFacts {
  platform: string
  arch: string
  release: string
  memory: number
  glibc?: string
}
export const requirements = {
  architectures: ['x64', 'arm64'],
  memoryBytes: 2 * 1024 ** 3,
  diskBytes: 1024 ** 3,
  windows: '10.0.19045',
  darwin: '22.0.0',
  glibc: '2.31',
  engine: { docker: '20.10.0', podman: '4.9.0' },
}
export function versionAtLeast(actual: string, required: string): boolean {
  const a = actual.replace(/^v/, '').split('.').map(Number),
    b = required.split('.').map(Number)
  if (a.some((n) => !Number.isFinite(n))) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0)
    if (delta) return delta > 0
  }
  return true
}
export function hostProblems(facts: HostFacts): string[] {
  const errors: string[] = []
  if (!requirements.architectures.includes(facts.arch))
    errors.push('Use the x64 or arm64 release matching your 64-bit system.')
  if (!['win32', 'darwin', 'linux'].includes(facts.platform))
    errors.push('Supported systems are Windows, Linux and macOS.')
  if (facts.platform === 'win32' && !versionAtLeast(facts.release, requirements.windows))
    errors.push('Windows 10 22H2 (build 19045) or later is required. Upgrade Windows.')
  if (facts.platform === 'darwin' && !versionAtLeast(facts.release, requirements.darwin))
    errors.push('macOS 13 Ventura or later is required. Upgrade macOS.')
  if (
    facts.platform === 'linux' &&
    (!facts.glibc || !versionAtLeast(facts.glibc, requirements.glibc))
  )
    errors.push(
      'A glibc 2.31+ desktop Linux distribution is required; musl-only hosts are unsupported.',
    )
  if (facts.memory < requirements.memoryBytes)
    errors.push('At least 2 GiB of system RAM is required; allocate more RAM to this machine/VM.')
  return errors
}
