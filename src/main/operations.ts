// SPDX-License-Identifier: MPL-2.0
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { OperationEvent } from '../shared/types'

let sink: (event: OperationEvent) => void = () => {}
export function setEventSink(fn: typeof sink): void {
  sink = fn
}
export function redact(text: string): string {
  return text
    .replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g, '[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@')
}
export function emit(event: OperationEvent): void {
  sink({ ...event, text: redact(event.text) })
}
export interface Operation {
  id: string
  channel: OperationEvent['channel']
  projectId?: string
  signal: AbortSignal
  output(text: string): void
}
const operations = new Map<string, AbortController>()
export function launch(
  channel: OperationEvent['channel'],
  projectId: string | undefined,
  task: (op: Operation) => Promise<void>,
): string {
  const id = randomUUID()
  const controller = new AbortController()
  operations.set(id, controller)
  const op: Operation = {
    id,
    channel,
    projectId,
    signal: controller.signal,
    output: (text) => emit({ id, projectId, channel, kind: 'output', text }),
  }
  setTimeout(() => {
    void task(op)
      .then(() =>
        emit({
          id,
          projectId,
          channel,
          kind: 'done',
          text: controller.signal.aborted
            ? 'Cancelled; inspect remaining resources.'
            : 'Completed.',
        }),
      )
      .catch((e) => emit({ id, projectId, channel, kind: 'error', text: String(e) }))
      .finally(() => operations.delete(id))
  }, 0)
  return id
}
export async function tracked<T>(
  channel: OperationEvent['channel'],
  task: (op: Operation) => Promise<T>,
): Promise<T> {
  const id = randomUUID()
  const controller = new AbortController()
  operations.set(id, controller)
  const op: Operation = {
    id,
    channel,
    signal: controller.signal,
    output: (text) => emit({ id, channel, kind: 'output', text }),
  }
  op.output('Starting operation…\n')
  try {
    const result = await task(op)
    emit({ id, channel, kind: 'done', text: 'Project operation completed.' })
    return result
  } catch (error) {
    emit({ id, channel, kind: 'error', text: String(error) })
    throw error
  } finally {
    operations.delete(id)
  }
}
export function cancel(id: string): void {
  operations.get(id)?.abort()
}
export function cancelAll(): void {
  for (const controller of operations.values()) controller.abort()
}
export function commandEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH:
      process.platform === 'win32'
        ? process.env.PATH
        : [
            ...new Set([
              process.env.PATH,
              '/usr/local/bin',
              '/opt/homebrew/bin',
              '/usr/bin',
              '/bin',
            ]),
          ]
            .filter(Boolean)
            .join(':'),
    GIT_TERMINAL_PROMPT: '0',
    GH_PROMPT_DISABLED: '1',
    ...extra,
  }
}
export async function run(
  binary: string,
  args: string[],
  options: {
    cwd?: string
    signal?: AbortSignal
    output?: (text: string) => void
    timeout?: number
    env?: NodeJS.ProcessEnv
    input?: string
    sensitive?: string[]
    allowFailure?: boolean
  } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: commandEnv(options.env),
      windowsHide: true,
      stdio: [options.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      shell: false,
    })
    child.stdin?.on('error', () => {})
    if (options.input !== undefined) child.stdin?.end(options.input)
    const sanitize = (value: string): string =>
      (options.sensitive ?? [])
        .filter(Boolean)
        .reduce((text, secret) => text.split(secret).join('[redacted]'), redact(value))
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const stop = (): void => {
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
      timer.unref()
    }
    const abort = (): void => stop()
    if (options.signal?.aborted) stop()
    options.signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      stop()
    }, options.timeout ?? 120000)
    const collect = (stream: 'stdout' | 'stderr', data: Buffer): void => {
      const text = sanitize(data.toString())
      options.output?.(sanitize(text))
      if (stream === 'stdout') stdout = (stdout + text).slice(-2_000_000)
      else stderr = (stderr + text).slice(-2_000_000)
    }
    child.stdout?.on('data', (data) => collect('stdout', data))
    child.stderr?.on('data', (data) => collect('stderr', data))
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
      if (options.signal?.aborted) return reject(new Error('Operation cancelled.'))
      if (timedOut) return reject(new Error(`Timed out: ${binary}`))
      if (code !== 0 && !options.allowFailure)
        return reject(new Error(sanitize(`${binary}: ${stderr || stdout || `exit ${code}`}`)))
      resolve({ stdout: sanitize(stdout), stderr: sanitize(stderr), code: code ?? -1 })
    })
  })
}

export function hasActiveOperations(): boolean {
  return operations.size > 0
}
