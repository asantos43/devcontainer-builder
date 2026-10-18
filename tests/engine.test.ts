// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, settingsSchema, validEndpoint } from '../src/shared/settings'
const mocks = vi.hoisted(() => ({ settings: {} as Record<string, unknown>, run: vi.fn() }))
vi.mock('../src/main/settings', () => ({ getSettings: async () => mocks.settings }))
vi.mock('../src/main/operations', () => ({
  run: mocks.run,
  commandEnv: (extra: object) => ({ ...process.env, ...extra }),
}))
import { docker, endpoint, engineConnection, engineRun } from '../src/main/engine'
beforeEach(() => {
  mocks.settings = { ...defaultSettings }
  mocks.run.mockReset()
  vi.stubEnv('DOCKER_HOST', '')
  vi.stubEnv('CONTAINER_HOST', '')
})
afterEach(() => vi.unstubAllEnvs())
describe('engine selection and endpoints', () => {
  it('migrates legacy settings while keeping Docker as the default', () => {
    const s = settingsSchema.parse({
      locale: 'en',
      dockerEndpoint: '',
      shell: '/bin/sh',
      recent: [],
    })
    expect(s.engine).toBe('docker')
    expect(s.theme).toBe('dark-modern')
    expect(s.autoUpdate).toBe(false)
  })
  it('rejects malformed hosts, inline credentials and URL options', () => {
    for (const value of [
      'https://user:secret@host',
      'unix://relative',
      'ssh://user@host?command=x',
      'file:///tmp/socket',
      'tcp://host\n',
    ])
      expect(validEndpoint(value)).toBe(false)
    for (const value of [
      '',
      'unix:///run/podman/podman.sock',
      'ssh://user@host:2222',
      'tcp://host:2375',
      'https://host:2376',
      'npipe:////./pipe/docker_engine',
    ])
      expect(validEndpoint(value)).toBe(true)
  })
  it('discovers rootless Podman independently of Docker environment and contexts', async () => {
    mocks.settings.engine = 'podman'
    vi.stubEnv('XDG_RUNTIME_DIR', '/run/user/7654')
    vi.stubEnv('DOCKER_HOST', 'unix:///wrong.sock')
    if (process.platform === 'linux')
      expect(await endpoint()).toBe('unix:///run/user/7654/podman/podman.sock')
    expect(mocks.run).not.toHaveBeenCalled()
  })
  it('passes the same endpoint to Podman CLI and Dockerode', async () => {
    mocks.settings = {
      ...defaultSettings,
      engine: 'podman',
      dockerEndpoint: 'unix:///tmp/podman.sock',
    }
    const connection = await engineConnection()
    expect(connection.env.CONTAINER_HOST).toBe('unix:///tmp/podman.sock')
    expect(connection.env.DOCKER_HOST).toBe('unix:///tmp/podman.sock')
    expect(((await docker()).modem as unknown as { socketPath: string }).socketPath).toBe(
      '/tmp/podman.sock',
    )
    await engineRun(['version'])
    expect(mocks.run).toHaveBeenCalledWith(
      'podman',
      ['version'],
      expect.objectContaining({
        env: expect.objectContaining({ CONTAINER_HOST: 'unix:///tmp/podman.sock' }),
      }),
    )
  })
  it('honors Docker contexts and TCP endpoints', async () => {
    mocks.run.mockResolvedValue({ stdout: 'unix:///tmp/context.sock\n' })
    expect(await endpoint()).toBe('unix:///tmp/context.sock')
    mocks.settings.dockerEndpoint = 'tcp://127.0.0.1:2375'
    const client = await docker()
    expect((client.modem as unknown as { host: string }).host).toBe('127.0.0.1')
    expect((client.modem as unknown as { port: number }).port).toBe(2375)
  })
})
