// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { exclusionReason, inside, safeArchivePath } from '../src/shared/paths'
describe('project and archive boundaries', () => {
  it('rejects traversal, sibling-prefix collisions and absolute archive paths', () => {
    const root = path.resolve('/tmp/project')
    expect(inside(root, path.join(root, 'sub', 'x'))).toBe(true)
    expect(inside(root, root + '-other')).toBe(false)
    for (const bad of [
      '../secret',
      'a/../../secret',
      '/etc/passwd',
      'C:/secret',
      'a\\..\\secret',
      'a//b',
    ])
      expect(safeArchivePath(bad)).toBe(false)
  })
  it('excludes secrets, Git metadata and dependencies', () => {
    for (const bad of [
      '.git/config',
      '.env',
      '.env.local',
      'cert.pem',
      '.ssh/id_ed25519',
      '.aws/credentials',
      'node_modules/a.js',
      'src/.npmrc',
    ])
      expect(exclusionReason(bad)).toBeTruthy()
    for (const good of [
      '.env.example',
      '.devcontainer/devcontainer.json',
      'src/index.ts',
      'README.md',
    ])
      expect(exclusionReason(good)).toBeUndefined()
  })
})
