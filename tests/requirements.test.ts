// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { hostProblems, versionAtLeast, type HostFacts } from '../src/shared/requirements'
const base: HostFacts = {
  platform: 'linux',
  arch: 'x64',
  release: '6.0',
  memory: 4 * 1024 ** 3,
  glibc: '2.35',
}
describe('release prerequisites', () => {
  it.each([
    { ...base },
    { ...base, platform: 'win32', release: '10.0.19045' },
    { ...base, platform: 'darwin', release: '22.0.0', arch: 'arm64' },
  ])('accepts supported host %o', (facts) => expect(hostProblems(facts)).toEqual([]))
  it.each([
    { ...base, glibc: undefined },
    { ...base, glibc: '2.30' },
    { ...base, platform: 'win32', release: '10.0.19044' },
    { ...base, platform: 'darwin', release: '21.6.0' },
    { ...base, arch: 'ia32' },
    { ...base, memory: 1024 ** 3 },
  ])('rejects unsupported host %o', (facts) =>
    expect(hostProblems(facts).length).toBeGreaterThan(0),
  )
  it('compares versions numerically and refuses unrecognized output', () => {
    expect(versionAtLeast('v20.10.1', '20.10')).toBe(true)
    expect(versionAtLeast('2.9', '2.31')).toBe(false)
    expect(versionAtLeast('unknown', '1')).toBe(false)
  })
})

describe('production signing preflight', () => {
  const script = readFileSync('scripts/check-release-signing.mjs', 'utf8')
  const check = (platform: string, env: Record<string, string>) =>
    runInNewContext(script, { process: { platform, env, argv: [] } })
  it('blocks unsigned Windows/macOS production releases while allowing development builds', () => {
    for (const platform of ['win32', 'darwin']) {
      expect(() => check(platform, {})).not.toThrow()
      expect(() => check(platform, { DCB_RELEASE: '1' })).toThrow(/CSC_LINK/)
    }
    expect(() =>
      check('win32', { DCB_RELEASE: '1', CSC_LINK: 'fixture', CSC_KEY_PASSWORD: 'fixture' }),
    ).not.toThrow()
    expect(() =>
      check('darwin', { DCB_RELEASE: '1', CSC_LINK: 'fixture', CSC_KEY_PASSWORD: 'fixture' }),
    ).toThrow(/APPLE_ID/)
    expect(() =>
      check('darwin', {
        DCB_RELEASE: '1',
        CSC_LINK: 'fixture',
        CSC_KEY_PASSWORD: 'fixture',
        APPLE_ID: 'fixture',
        APPLE_APP_SPECIFIC_PASSWORD: 'fixture',
        APPLE_TEAM_ID: 'fixture',
      }),
    ).not.toThrow()
  })
})

it('checks an explicit Windows release target even when packaging on Linux', () => {
  const script = readFileSync('scripts/check-release-signing.mjs', 'utf8')
  expect(() =>
    runInNewContext(script, {
      process: {
        platform: 'linux',
        env: { DCB_RELEASE: '1' },
        argv: ['node', 'preflight', 'win32'],
      },
    }),
  ).toThrow(/CSC_LINK/)
})
