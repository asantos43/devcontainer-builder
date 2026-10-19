// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest'
import {
  createConfig,
  mountString,
  parseMount,
  patchConfig,
  readConfig,
  validateConfig,
  wizardDefaults,
} from '../src/shared/config'

describe('JSONC configuration', () => {
  it('retains comments, unknown properties, trailing commas and CRLF', () => {
    const source =
      '// team note\r\n{\r\n  "image": "ubuntu:24.04", // base\r\n  "custom": { "keep": true },\r\n}\r\n'
    const changed = patchConfig(source, ['name'], 'Example')
    expect(changed).toContain('// team note\r\n')
    expect(changed).toContain('// base')
    expect(readConfig(changed).config.custom).toEqual({ keep: true })
    expect(changed.replaceAll('\r\n', '')).not.toContain('\n')
  })
  it('does not replace a property mentioned in a comment', () => {
    const source = '// "image": "do not touch"\n{"image":"ubuntu:24.04"}\n'
    const changed = patchConfig(patchConfig(source, ['image'], undefined), ['build'], {
      dockerfile: 'Dockerfile',
    })
    expect(changed).toContain('// "image": "do not touch"')
    expect(readConfig(changed).config.image).toBeUndefined()
  })
  it('refuses visual edits to invalid JSONC', () =>
    expect(() => patchConfig('{ broken', ['name'], 'x')).toThrow())
  it('rejects arrays and missing build sources', () => {
    expect(readConfig('[]').errors).not.toHaveLength(0)
    expect(validateConfig('{}').some((e) => e.level === 'error')).toBe(true)
  })
  it('rejects conflicting sources and malformed build fields', () => {
    expect(
      validateConfig('{"image":"ubuntu","build":{"dockerfile":"D"}}').some(
        (d) => d.level === 'error',
      ),
    ).toBe(true)
    expect(validateConfig('{"build":[]}').some((d) => d.level === 'error')).toBe(true)
  })
  it('identifies Compose as source-only', () =>
    expect(
      validateConfig('{"dockerComposeFile":"compose.yml"}').some((e) =>
        e.message.includes('Compose'),
      ),
    ).toBe(true))
  it('distinguishes IDE forwarding from published ports', () =>
    expect(
      validateConfig('{"image":"ubuntu","forwardPorts":[3000]}').some((e) => e.level === 'warning'),
    ).toBe(true))
  it('detects invalid ports and nested mounts', () => {
    const c = {
      image: 'ubuntu',
      forwardPorts: [70000],
      mounts: ['type=bind,source=/a,target=/data', 'type=volume,source=b,target=/data/cache'],
    }
    expect(validateConfig(JSON.stringify(c)).filter((e) => e.level === 'error')).toHaveLength(1)
    expect(validateConfig(JSON.stringify(c)).some((e) => e.level === 'warning')).toBe(true)
  })
  it('generates a portable workspace and official features from wizard data', () => {
    const data = wizardDefaults()
    data.features = { 'ghcr.io/devcontainers/features/docker-outside-of-docker:1': {} }
    data.mounts = [{ type: 'volume', source: 'cache', target: '/cache', readOnly: false }]
    const config = readConfig(createConfig(data)).config
    expect(config.workspaceMount).toContain('${localWorkspaceFolder}')
    expect(config.mounts).toEqual(['type=volume,source=cache,target=/cache'])
    expect(validateConfig(createConfig(data)).filter((d) => d.level === 'error')).toEqual([])
  })
  it('preserves Windows paths and spaces in mount syntax', () => {
    const m = {
      type: 'bind' as const,
      source: 'C:\\My Projects\\app',
      target: '/app',
      readOnly: true,
    }
    expect(parseMount(mountString(m))).toEqual(m)
  })
  it('accepts imported mount targets with variables without changing the template', () => {
    const config = {
      name: 'Task Authoring',
      build: { dockerfile: 'Dockerfile' },
      workspaceMount: 'source=${localWorkspaceFolder},target=/workspace,type=bind',
      workspaceFolder: '/workspace',
      mounts: [
        'source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind',
        'source=${localWorkspaceFolder},target=${localWorkspaceFolder},type=bind',
      ],
    }
    const text = '// existing production config\n' + JSON.stringify(config, null, 2)
    expect(validateConfig(text)).toEqual([])
    const changed = patchConfig(text, ['name'], 'Reviewed')
    expect(changed).toContain('// existing production config')
    expect(readConfig(changed).config.mounts).toEqual(config.mounts)
    expect(readConfig(changed).config.workspaceMount).toBe(config.workspaceMount)
    const parsed = parseMount(config.mounts[1])!
    expect(mountString(parsed)).toBe(
      'type=bind,source=${localWorkspaceFolder},target=${localWorkspaceFolder}',
    )
  })
  it.each([
    '${localWorkspaceFolder}',
    '${containerWorkspaceFolder}/cache',
    '${localEnv:CONTAINER_PATH:/workspace}',
  ])('defers expansion of the container path %s to the CLI', (target) => {
    const mount = {
      type: 'bind' as const,
      source: '${localWorkspaceFolder}',
      target,
      readOnly: false,
    }
    expect(parseMount(mountString(mount))).toEqual(mount)
    expect(
      validateConfig(JSON.stringify({ image: 'alpine', workspaceFolder: target, mounts: [mount] })),
    ).toEqual([])
  })
  it('accepts variable-based volume names while validating their literal parts', () => {
    const mount = {
      type: 'volume' as const,
      source: '${localWorkspaceFolderBasename}-${devcontainerId}-cache',
      target: '/cache',
      readOnly: false,
    }
    expect(parseMount(mountString(mount))).toEqual(mount)
    expect(validateConfig(JSON.stringify({ image: 'alpine', mounts: [mount] }))).toEqual([])
    expect(() => mountString({ ...mount, source: '${devcontainerId}-bad name' })).toThrow(
      'Invalid Docker volume name',
    )
  })
  it.each(['', 'relative/path', 'relative/${localWorkspaceFolder}', '${localWorkspaceFolder'])(
    'rejects invalid literal or incomplete container paths: %s',
    (target) => {
      expect(() =>
        mountString({ type: 'bind', source: '/source', target, readOnly: false }),
      ).toThrow('absolute container path')
      expect(
        validateConfig(
          JSON.stringify({
            image: 'alpine',
            mounts: [{ type: 'bind', source: '/source', target }],
          }),
        ).some((d) => d.level === 'error'),
      ).toBe(true)
    },
  )
  it('still reports duplicate and nested variable-based mount destinations', () => {
    const mounts = [
      'type=bind,source=/first,target=${localWorkspaceFolder}',
      'type=bind,source=/second,target=${localWorkspaceFolder}',
      'type=bind,source=/third,target=${localWorkspaceFolder}/cache',
    ]
    const diagnostics = validateConfig(JSON.stringify({ image: 'alpine', mounts }))
    expect(diagnostics.filter((d) => d.level === 'error')).toEqual([
      { level: 'error', message: 'Duplicate mount destination: ${localWorkspaceFolder}' },
    ])
    expect(diagnostics.some((d) => d.message.includes('Nested mount'))).toBe(true)
  })
  it('rejects ambiguous comma-separated paths and invalid volume names', () => {
    expect(() =>
      mountString({ type: 'bind', source: '/a,b', target: '/data', readOnly: false }),
    ).toThrow()
    expect(() =>
      mountString({ type: 'volume', source: 'bad name', target: '/data', readOnly: false }),
    ).toThrow()
  })
})
