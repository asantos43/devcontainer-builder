// SPDX-License-Identifier: MPL-2.0
import { utilityProcess, dialog } from 'electron'
import Docker from 'dockerode'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { PassThrough, type Duplex } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { readConfig, validateConfig, parseMount } from '../shared/config'
import type { Capability, RuntimeState, TestResult } from '../shared/types'
import { getSettings } from './settings'
import { projectFor, checkedPath, hasChanged } from './projects'
import { commandEnv, emit, launch, run, redact, type Operation } from './operations'

const states = new Map<string, RuntimeState>()
const reports = new Map<string, TestResult[]>()
const remoteEnvironments = new Map<string, Record<string, unknown>>()
const sessions = new Map<
  string,
  {
    stream: Duplex
    exec: Docker.Exec
    projectId: string
    container: Docker.Container
    marker: string
    user?: string
  }
>()
const busy = new Set<string>()
function ownership(id: string): string {
  const p = projectFor(id)
  return createHash('sha256')
    .update(p.root + '\0' + p.configPath)
    .digest('hex')
    .slice(0, 24)
}
export async function endpoint(): Promise<string> {
  const settings = await getSettings()
  if (settings.dockerEndpoint) return settings.dockerEndpoint
  if (process.env.DOCKER_HOST) return process.env.DOCKER_HOST
  try {
    const result = await run(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { timeout: 10000 },
    )
    return result.stdout.trim()
  } catch {
    return process.platform === 'win32'
      ? 'npipe:////./pipe/docker_engine'
      : 'unix:///var/run/docker.sock'
  }
}
export async function docker(): Promise<Docker> {
  const address = await endpoint()
  if (address.startsWith('unix://')) return new Docker({ socketPath: address.slice(7) })
  if (address.startsWith('npipe://'))
    return new Docker({ socketPath: '\\\\.\\pipe\\' + address.split('/').filter(Boolean).at(-1) })
  throw new Error('Remote Docker SSH/TCP endpoints are not supported in this version.')
}
export async function contexts(): Promise<{ name: string; endpoint: string }[]> {
  const result = await run('docker', ['context', 'ls', '--format', '{{json .}}'], {
    timeout: 10000,
  })
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line)
      return { name: row.Name as string, endpoint: row.DockerEndpoint as string }
    })
}
export async function capabilities(): Promise<Capability[]> {
  const items = await Promise.all(
    ['git', 'gh', 'docker'].map(async (name) => {
      try {
        const r = await run(name, ['--version'], { timeout: 10000 })
        return { name, ok: true, detail: r.stdout.trim() }
      } catch (e) {
        return { name, ok: false, detail: String(e) }
      }
    }),
  )
  try {
    await (await docker()).ping()
    items.push({ name: 'Docker daemon', ok: true, detail: await endpoint() })
  } catch (e) {
    items.push({ name: 'Docker daemon', ok: false, detail: String(e) })
  }
  try {
    const r = await run('gh', ['auth', 'status'], { timeout: 10000 })
    items.push({ name: 'GitHub login', ok: true, detail: r.stdout || r.stderr })
  } catch (e) {
    items.push({ name: 'GitHub login', ok: false, detail: String(e) })
  }
  return items
}
export function cliEntry(): string {
  return require
    .resolve('@devcontainers/cli/devcontainer.js')
    .replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
}
export async function cli(args: string[], cwd: string, op: Operation): Promise<string> {
  if (op.signal.aborted) throw new Error('Operation cancelled.')
  const host = await endpoint()
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(cliEntry(), args, {
      cwd,
      stdio: 'pipe',
      serviceName: 'Dev Containers CLI',
      env: commandEnv({
        DOCKER_HOST: host,
        DOCKER_CONTEXT: '',
        DOCKER_TLS_VERIFY: '',
        DOCKER_CERT_PATH: '',
      }),
    })
    let output = ''
    let errors = ''
    const abort = (): void => {
      child.kill()
    }
    op.signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => child.kill(), 30 * 60 * 1000)
    // utilityProcess emits exit before its pipes are guaranteed to be drained.
    // The final JSON result can arrive after exit; wait for both pipe closures.
    const drained = Promise.all(
      [child.stdout, child.stderr].map((stream) =>
        stream
          ? new Promise<void>((resolve) => {
              stream.once('end', resolve)
              stream.once('close', resolve)
              stream.once('error', () => resolve())
            })
          : Promise.resolve(),
      ),
    )
    child.stdout?.on('data', (data: Buffer) => {
      output = (output + data.toString()).slice(-4_000_000)
      // The final result includes merged configuration; keep it out of logs.
    })
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      errors = (errors + text).slice(-2_000_000)
      op.output(text)
    })
    child.on('exit', (code) => {
      void drained.then(() => {
        clearTimeout(timeout)
        op.signal.removeEventListener('abort', abort)
        if (code !== 0 || op.signal.aborted)
          reject(
            new Error(
              op.signal.aborted
                ? 'Cancelled. Inspect remaining resources.'
                : errors || `CLI exited ${code}`,
            ),
          )
        else resolve(output)
      })
    })
  })
}
export async function runtimeState(id: string): Promise<RuntimeState> {
  const client = await docker()
  const containers = await client.listContainers({
    all: true,
    filters: JSON.stringify({ label: [`devcontainer-builder.project=${ownership(id)}`] }),
  })
  if (!containers.length) {
    states.delete(id)
    return { status: 'not-created' }
  }
  const found = containers.find((c) => c.State === 'running') ?? containers[0]
  const config = readConfig(projectFor(id).configText).config
  const info = await client.getContainer(found.Id).inspect()
  const state = {
    remoteUser:
      typeof config.remoteUser === 'string' ? config.remoteUser : info.Config.User || 'root',
    workspaceFolder:
      typeof config.workspaceFolder === 'string'
        ? config.workspaceFolder.replaceAll(
            '${localWorkspaceFolderBasename}',
            path.basename(projectFor(id).root),
          )
        : info.Config.WorkingDir || '/workspaces/' + path.basename(projectFor(id).root),
    ...states.get(id),
    containerId: found.Id,
    status: found.State,
  }
  states.set(id, state)
  return state
}
async function ownedContainer(id: string): Promise<Docker.Container> {
  const state = await runtimeState(id)
  if (!state.containerId) throw new Error('Start the environment first.')
  const c = (await docker()).getContainer(state.containerId)
  const info = await c.inspect()
  if (info.Config.Labels?.['devcontainer-builder.project'] !== ownership(id))
    throw new Error('Container ownership mismatch.')
  return c
}
async function validateMountSources(id: string): Promise<void> {
  const p = projectFor(id)
  const { config } = readConfig(p.configText)
  for (const raw of [
    ...(Array.isArray(config.mounts) ? config.mounts : []),
    ...(config.workspaceMount ? [config.workspaceMount] : []),
  ]) {
    const mount = parseMount(raw)
    if (mount?.type === 'bind') {
      const source = mount.source
        .replaceAll('${localWorkspaceFolder}', p.root)
        .replaceAll('${localWorkspaceFolderBasename}', path.basename(p.root))
      if (!source.includes('${')) await fs.access(path.resolve(p.root, source))
    }
  }
}
async function startInternal(id: string, op: Operation): Promise<void> {
  const p = projectFor(id)
  if (await hasChanged(id))
    throw new Error('Files changed on disk. Reload and review before running.')
  const diagnostics = validateConfig(p.configText).filter((d) => d.level === 'error')
  if (diagnostics.length) throw new Error(diagnostics.map((d) => d.message).join('\n'))
  await validateMountSources(id)
  const raw = await cli(
    [
      'up',
      '--workspace-folder',
      p.root,
      '--config',
      await checkedPath(p.root, p.configPath),
      '--id-label',
      `devcontainer-builder.project=${ownership(id)}`,
      '--include-configuration',
      '--include-merged-configuration',
      '--log-format',
      'text',
      '--log-level',
      'info',
    ],
    p.root,
    op,
  )
  const result = raw
    .trim()
    .split('\n')
    .reverse()
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>
      } catch {
        return {}
      }
    })
    .find((value) => value.containerId)
  if (!result) throw new Error('CLI did not return a container ID. Inspect the build log.')
  const merged =
    result.mergedConfiguration && typeof result.mergedConfiguration === 'object'
      ? (result.mergedConfiguration as Record<string, unknown>)
      : readConfig(p.configText).config
  remoteEnvironments.set(
    id,
    merged.remoteEnv && typeof merged.remoteEnv === 'object'
      ? (merged.remoteEnv as Record<string, unknown>)
      : {},
  )
  states.set(id, {
    containerId: String(result.containerId),
    status: 'running',
    remoteUser: String(result.remoteUser ?? merged.remoteUser ?? 'root'),
    workspaceFolder: String(
      result.remoteWorkspaceFolder ??
        merged.workspaceFolder ??
        '/workspaces/' + path.basename(p.root),
    ),
  })
}
export function start(id: string): string {
  projectFor(id)
  if (busy.has(id)) throw new Error('An operation is already running for this project.')
  busy.add(id)
  return launch('build', id, async (op) => {
    try {
      await startInternal(id, op)
    } finally {
      busy.delete(id)
    }
  })
}
export async function stop(id: string): Promise<void> {
  if (busy.has(id)) throw new Error('Cancel the active operation first.')
  closeProjectSessions(id)
  const c = await ownedContainer(id)
  const info = await c.inspect()
  if (info.State.Running) await c.stop()
  states.set(id, { ...states.get(id), status: 'exited' })
}
export async function clean(id: string): Promise<void> {
  if (busy.has(id)) throw new Error('Cancel the active operation first.')
  const response = await dialog.showMessageBox({
    type: 'warning',
    message: 'Remove the managed container? / Remover o container gerenciado?',
    detail:
      'Persistent volumes and images are preserved. / Volumes persistentes e imagens serão preservados.',
    buttons: ['Cancel / Cancelar', 'Remove / Remover'],
    cancelId: 0,
    defaultId: 0,
  })
  if (response.response !== 1) return
  closeProjectSessions(id)
  await (await ownedContainer(id)).remove({ force: true, v: false })
  states.delete(id)
}
export function logs(id: string): string {
  projectFor(id)
  return launch('logs', id, async (op) => {
    const c = await ownedContainer(id)
    const info = await c.inspect()
    const stream = (await c.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 200,
    })) as unknown as Duplex
    const out = new PassThrough()
    const err = new PassThrough()
    const decoderOut = new StringDecoder('utf8')
    const decoderErr = new StringDecoder('utf8')
    out.on('data', (b) => op.output(decoderOut.write(b)))
    err.on('data', (b) => op.output(decoderErr.write(b)))
    if (info.Config.Tty) stream.pipe(out)
    else (await docker()).modem.demuxStream(stream, out, err)
    await new Promise<void>((resolve, reject) => {
      const abort = (): void => {
        stream.destroy()
        resolve()
      }
      op.signal.addEventListener('abort', abort, { once: true })
      stream.on('end', () => {
        op.signal.removeEventListener('abort', abort)
        resolve()
      })
      stream.on('error', reject)
    })
  })
}
async function execEnvironment(id: string, container: Docker.Container): Promise<string[]> {
  const config = readConfig(projectFor(id).configText).config
  const remote =
    remoteEnvironments.get(id) ??
    (config.remoteEnv && typeof config.remoteEnv === 'object'
      ? (config.remoteEnv as Record<string, unknown>)
      : {})
  const info = await container.inspect()
  const environment = Object.fromEntries(
    (info.Config.Env ?? []).map((item) => {
      const i = item.indexOf('=')
      return [item.slice(0, i), item.slice(i + 1)]
    }),
  )
  return Object.entries(remote)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(
      ([key, value]) =>
        key +
        '=' +
        value
          .replace(
            /\$\{containerEnv:([^}:]+)(?::([^}]*))?\}/g,
            (_match, name, fallback) => environment[name] ?? fallback ?? '',
          )
          .replace(
            /\$\{localEnv:([^}:]+)(?::([^}]*))?\}/g,
            (_match, name, fallback) => process.env[name] ?? fallback ?? '',
          ),
    )
}
export async function openTerminal(id: string): Promise<string> {
  const c = await ownedContainer(id)
  const current = states.get(id) ?? { status: 'running' }
  const settings = await getSettings()
  const environment = await execEnvironment(id, c)
  const session = randomUUID()
  const marker = `/tmp/dcb-shell-${session}.pid`
  let exec: Docker.Exec | undefined
  for (const shell of [...new Set([settings.shell || '/bin/bash', '/bin/sh'])]) {
    try {
      const check = await c.exec({
        Cmd: ['/bin/sh', '-c', 'test -x "$1"', 'sh', shell],
        AttachStdout: true,
        AttachStderr: true,
        User: current.remoteUser,
      })
      const checkStream = (await check.start({})) as Duplex
      checkStream.resume()
      await new Promise<void>((resolve) => checkStream.on('end', resolve))
      if ((await check.inspect()).ExitCode !== 0) continue
      exec = await c.exec({
        Cmd: ['/bin/sh', '-c', 'echo $$ > "$1"; exec "$2"', 'sh', marker, shell],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        User: current.remoteUser,
        WorkingDir: current.workspaceFolder,
        Env: ['TERM=xterm-256color', ...environment],
      })
      break
    } catch {
      /* try next shell */
    }
  }
  if (!exec) throw new Error('No supported shell found in the container.')
  const stream = (await exec.start({ hijack: true, stdin: true, Tty: true })) as Duplex
  sessions.set(session, {
    stream,
    exec,
    projectId: id,
    container: c,
    marker,
    user: current.remoteUser,
  })
  const decoder = new StringDecoder('utf8')
  stream.on('data', (data) =>
    emit({
      id: session,
      projectId: id,
      channel: 'terminal',
      kind: 'output',
      text: decoder.write(data),
    }),
  )
  let finished = false
  const finish = (): void => {
    if (finished) return
    finished = true
    sessions.delete(session)
    emit({
      id: session,
      projectId: id,
      channel: 'terminal',
      kind: 'done',
      text: '\r\n[session closed]\r\n',
    })
  }
  stream.on('end', finish)
  stream.on('close', finish)
  stream.on('error', (error) => {
    sessions.delete(session)
    emit({ id: session, projectId: id, channel: 'terminal', kind: 'error', text: String(error) })
  })
  return session
}
export function writeTerminal(session: string, data: string): void {
  const s = sessions.get(session)
  if (!s) throw new Error('Terminal session closed.')
  s.stream.write(data)
}
export async function resizeTerminal(session: string, cols: number, rows: number): Promise<void> {
  const s = sessions.get(session)
  if (s) await s.exec.resize({ h: rows, w: cols })
}
export async function closeTerminal(session: string): Promise<void> {
  const s = sessions.get(session)
  if (!s) return
  sessions.delete(session)
  s.stream.destroy()
  try {
    const killer = await s.container.exec({
      Cmd: [
        '/bin/sh',
        '-c',
        `if [ -f '${s.marker}' ]; then pid=$(cat '${s.marker}'); rm -f '${s.marker}'; kill -HUP "$pid" 2>/dev/null; fi`,
      ],
      User: s.user,
      AttachStdout: true,
      AttachStderr: true,
    })
    const stream = (await killer.start({})) as Duplex
    stream.resume()
  } catch {
    /* container may already have stopped */
  }
}
export function closeProjectSessions(id: string): void {
  for (const [key, s] of sessions) if (s.projectId === id) void closeTerminal(key)
}
export function closeAllSessions(): void {
  for (const key of sessions.keys()) void closeTerminal(key)
}

async function executeTest(
  id: string,
  test: import('../shared/types').TestCommand,
  op: Operation,
): Promise<TestResult> {
  const container = await ownedContainer(id)
  const current = states.get(id)
  const token = randomUUID()
  const marker = `/tmp/dcb-${token}.pid`
  // A session leader allows cancellation of the test process group when setsid is available.
  const script = `echo $$ > '${marker}'; trap 'rm -f "${marker}"' EXIT; if command -v setsid >/dev/null 2>&1; then setsid /bin/sh -c "$1" & else /bin/sh -c "$1" & fi; child=$!; echo "$child" >> '${marker}'; wait "$child"; result=$?; exit "$result"`
  const exec = await container.exec({
    Cmd: ['/bin/sh', '-c', script, 'sh', test.command],
    User: current?.remoteUser,
    WorkingDir: test.cwd || current?.workspaceFolder,
    Env: await execEnvironment(id, container),
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = (await exec.start({})) as Duplex
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  ;(await docker()).modem.demuxStream(stream, stdout, stderr)
  let output = ''
  const started = Date.now()
  let aborted = false
  const collect = (b: Buffer): void => {
    const text = redact(b.toString())
    output = (output + text).slice(-1_000_000)
    op.output(text)
  }
  stdout.on('data', collect)
  stderr.on('data', collect)
  const terminate = async (): Promise<void> => {
    aborted = true
    try {
      const killer = await container.exec({
        Cmd: [
          '/bin/sh',
          '-c',
          `if [ -f '${marker}' ]; then parent=$(head -n 1 '${marker}'); child=$(tail -n 1 '${marker}'); kill -TERM -- -"$child" 2>/dev/null || kill -TERM "$child" 2>/dev/null; kill -TERM "$parent" 2>/dev/null; rm -f '${marker}'; fi`,
        ],
        User: current?.remoteUser,
        AttachStdout: true,
        AttachStderr: true,
      })
      const cleanup = (await killer.start({})) as Duplex
      cleanup.resume()
    } finally {
      stream.destroy()
    }
  }
  const onAbort = (): void => {
    void terminate().catch((error) => {
      op.output('Cancellation cleanup: ' + String(error))
      stream.destroy()
    })
  }
  op.signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(onAbort, test.timeout)
  await new Promise<void>((resolve, reject) => {
    stream.on('end', resolve)
    stream.on('close', resolve)
    stream.on('error', reject)
  }).finally(() => {
    clearTimeout(timer)
    op.signal.removeEventListener('abort', onAbort)
  })
  const inspect = await exec.inspect()
  const code = aborted ? -1 : (inspect.ExitCode ?? -1)
  return {
    name: test.name,
    status: !aborted && code === test.expectedCode ? 'passed' : 'failed',
    exitCode: code,
    expectedCode: test.expectedCode,
    output: output + (aborted ? '\nCancelled or timed out.' : ''),
    duration: Date.now() - started,
  }
}
export function testProject(id: string): string {
  const p = projectFor(id)
  if (busy.has(id)) throw new Error('An operation is already running for this project.')
  busy.add(id)
  return launch('tests', id, async (op) => {
    const results: TestResult[] = []
    reports.set(id, results)
    try {
      op.output('Validate → build/start → inspect → custom checks\n')
      await startInternal(id, op)
      const info = await (await ownedContainer(id)).inspect()
      if (!info.State.Running) throw new Error('Container is not running.')
      for (const test of p.auxiliary.tests) {
        if (op.signal.aborted) throw new Error('Cancelled.')
        op.output(`\n▶ ${test.name}\n`)
        const result = await executeTest(id, test, op)
        results.push(result)
        op.output(
          `${result.status}: ${result.name} (exit ${result.exitCode}, ${result.duration} ms)\n`,
        )
        if (result.status === 'failed') throw new Error(`Test failed: ${result.name}`)
      }
    } finally {
      busy.delete(id)
    }
  })
}
export async function saveReport(id: string): Promise<void> {
  projectFor(id)
  const result = await dialog.showSaveDialog({
    defaultPath: 'devcontainer-test-report.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!result.canceled && result.filePath)
    await fs.writeFile(
      result.filePath,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), tests: reports.get(id) ?? [] },
        null,
        2,
      ),
    )
}
export async function stats(id: string): Promise<string> {
  const c = await ownedContainer(id)
  const [s, info] = await Promise.all([c.stats({ stream: false }), c.inspect()])
  return JSON.stringify(
    {
      name: info.Name,
      status: info.State.Status,
      ports: info.NetworkSettings.Ports,
      mounts: info.Mounts,
      memory: s.memory_stats,
      cpu: s.cpu_stats,
    },
    null,
    2,
  )
}
