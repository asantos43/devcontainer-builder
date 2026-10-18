// SPDX-License-Identifier: MPL-2.0
import path from 'node:path'
export function inside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  )
}
export function safeArchivePath(value: string): boolean {
  return (
    Boolean(value) &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !path.posix.isAbsolute(value) &&
    !value.split('/').some((p) => p === '..' || p === '') &&
    !/^[a-z]:/i.test(value)
  )
}
export function exclusionReason(relative: string): string | undefined {
  const parts = relative.replaceAll('\\', '/').split('/')
  if (
    parts.some((p) =>
      [
        '.git',
        'node_modules',
        'dist',
        'out',
        'release',
        'coverage',
        '.ssh',
        '.aws',
        '.azure',
        '.docker',
        '.gnupg',
        '.kube',
        'playwright-report',
        'test-results',
      ].includes(p),
    )
  )
    return 'metadata / dependencies / credentials / artifacts'
  if (
    parts.some(
      (p) =>
        /^\.env($|\.)/.test(p) && !['.env.example', '.env.sample', '.env.template'].includes(p),
    )
  )
    return 'environment secrets'
  if (
    parts.some(
      (p) =>
        /\.(pem|key|p12|pfx|jks)$/i.test(p) ||
        /^(id_rsa|id_ed25519|credentials|\.npmrc|\.netrc|\.git-credentials)$/i.test(p),
    )
  )
    return 'credentials'
  return undefined
}
