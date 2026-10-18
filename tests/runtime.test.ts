// SPDX-License-Identifier: MPL-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
const mocks = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock('electron', () => ({ utilityProcess: { fork: mocks.fork }, dialog: {} }))
vi.mock('../src/main/settings', () => ({
  getSettings: async () => ({ dockerEndpoint: 'unix:///tmp/test-docker.sock' }),
}))
import { cli } from '../src/main/runtime'
let child: EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  kill: ReturnType<typeof vi.fn>
}
beforeEach(() => {
  mocks.fork.mockReset()
  child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  })
  mocks.fork.mockReturnValue(child)
})
describe('bundled CLI lifecycle', () => {
  it('waits for stdout after exit before parsing the final result', async () => {
    const controller = new AbortController()
    const output = vi.fn()
    const result = cli(['--version'], process.cwd(), {
      id: 'test',
      channel: 'build',
      signal: controller.signal,
      output,
    })
    await vi.waitFor(() => expect(mocks.fork).toHaveBeenCalled())
    child.emit('exit', 0)
    child.stdout.end('{"outcome":"success","containerId":"late-result"}\n')
    child.stderr.end()
    expect(await result).toContain('late-result')
    expect(output).not.toHaveBeenCalled()
  })
  it('reports cancellation only after draining process pipes', async () => {
    const controller = new AbortController()
    const result = cli(['--version'], process.cwd(), {
      id: 'test',
      channel: 'build',
      signal: controller.signal,
      output: vi.fn(),
    })
    const rejection = expect(result).rejects.toThrow('Cancelled')
    await vi.waitFor(() => expect(mocks.fork).toHaveBeenCalled())
    controller.abort()
    expect(child.kill).toHaveBeenCalled()
    child.emit('exit', 1)
    child.stdout.end()
    child.stderr.end()
    await rejection
  })
})
