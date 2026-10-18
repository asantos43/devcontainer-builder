// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest'
import {
  composeReferences,
  composeServices,
  patchCompose,
  relativeComposePath,
} from '../src/shared/compose'
import { validateConfig } from '../src/shared/config'
describe('Compose editing', () => {
  it('preserves comments, unknown extensions and unrelated services', () => {
    const source =
      '# team configuration\nx-team: keep\nservices:\n  app:\n    # pinned image\n    image: alpine:3.22 # production note\n  database:\n    image: postgres:17\n'
    const edited = patchCompose(source, ['services', 'app', 'image'], 'alpine:3.23')
    expect(edited).toContain('# team configuration')
    expect(edited).toContain('# pinned image')
    expect(edited).toContain('# production note')
    expect(edited).toContain('x-team: keep')
    expect(edited).toContain('image: postgres:17')
    expect(composeServices(edited)).toEqual(['app', 'database'])
  })
  it('keeps CRLF and rejects invalid YAML before changing it', () => {
    expect(patchCompose('services: {}\r\n', ['services', 'app'], { image: 'alpine' })).toContain(
      '\r\n',
    )
    expect(() => patchCompose('services: [}', ['a'], 1)).toThrow('syntax')
  })
  it('supports multiple files and validates required service and exclusive base', () => {
    expect(
      composeReferences({ dockerComposeFile: ['compose.yaml', 'override.yaml'] }),
    ).toHaveLength(2)
    expect(validateConfig('{"dockerComposeFile":"compose.yaml","service":"app"}')).toEqual([])
    expect(
      validateConfig('{"dockerComposeFile":42}').filter((d) => d.level === 'error'),
    ).toHaveLength(2)
    expect(
      validateConfig('{"dockerComposeFile":"compose.yaml","service":"app","image":"alpine"}').some(
        (d) => d.level === 'error',
      ),
    ).toBe(true)
  })
  it('converts Dockerfile paths from devcontainer-relative to context-relative', () => {
    expect(relativeComposePath('..', 'Dockerfile')).toBe('.devcontainer/Dockerfile')
    expect(relativeComposePath('.', 'Dockerfile')).toBe('Dockerfile')
    expect(relativeComposePath('..', '../Dockerfile')).toBe('Dockerfile')
  })
})
