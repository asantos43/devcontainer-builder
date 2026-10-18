// SPDX-License-Identifier: MPL-2.0
import Docker from 'dockerode'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import { getSettings } from './settings'
import { commandEnv, run } from './operations'
import type { Settings } from '../shared/types'

let tunnel: { key: string; socket: string; directory: string; child: ChildProcess } | undefined
export async function closeEngineConnections(): Promise<void> {
  const previous = tunnel
  tunnel = undefined
  if (previous) {
    previous.child.kill()
    await fs.rm(previous.directory, { recursive: true, force: true })
  }
}
export async function endpoint(settings?: Settings): Promise<string> {
  settings ??= await getSettings()
  if (settings.dockerEndpoint) return settings.dockerEndpoint
  if (settings.engine === 'podman') {
    if (process.env.CONTAINER_HOST) return process.env.CONTAINER_HOST
    if (process.platform !== 'linux') {
      const result = await run(
        'podman',
        ['machine', 'inspect', '--format', '{{.ConnectionInfo.PodmanSocket.Path}}'],
        { timeout: 10000 },
      )
      if (!result.stdout.trim())
        throw new Error('Start Podman Machine and select its API socket in settings.')
      return 'unix://' + result.stdout.trim()
    }
    return `unix://${process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`}/podman/podman.sock`
  }
  if (process.env.DOCKER_HOST) return process.env.DOCKER_HOST
  try {
    return (
      await run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
        timeout: 10000,
      })
    ).stdout.trim()
  } catch {
    return process.platform === 'win32'
      ? 'npipe:////./pipe/docker_engine'
      : 'unix:///var/run/docker.sock'
  }
}
async function sshEndpoint(address: string, settings: Settings): Promise<string> {
  const key = address + '\0' + settings.sshSocketPath
  if (tunnel?.key === key && tunnel.child.exitCode === null && !tunnel.child.killed)
    return 'unix://' + tunnel.socket
  await closeEngineConnections()
  if (process.platform === 'win32')
    throw new Error('SSH socket forwarding requires Linux/macOS. Use a TLS endpoint on Windows.')
  const u = new URL(address)
  if (!/^[\w.-]+$/.test(u.hostname) || (u.username && !/^[\w.-]+$/.test(u.username)))
    throw new Error('Invalid SSH host or username.')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-ssh-'))
  const socket = path.join(directory, 'engine.sock')
  const remote =
    settings.sshSocketPath ||
    (settings.engine === 'podman' ? '/run/podman/podman.sock' : '/var/run/docker.sock')
  const child = spawn(
    'ssh',
    [
      '-N',
      '-T',
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ConnectTimeout=10',
      '-p',
      u.port || '22',
      '-L',
      `${socket}:${remote}`,
      `${u.username ? u.username + '@' : ''}${u.hostname}`,
    ],
    { env: commandEnv(), stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let error = ''
  let spawnError: Error | undefined
  child.stderr?.on('data', (b) => {
    error = (error + b.toString()).slice(-4096)
  })
  child.on('error', (e) => {
    spawnError = e
    error = e.message
  })
  tunnel = { key, socket, directory, child }
  try {
    for (let i = 0; i < 120; i++) {
      if (spawnError || child.exitCode !== null) throw new Error(error || 'SSH tunnel exited.')
      try {
        await fs.access(socket)
        return 'unix://' + socket
      } catch {
        /* wait for OpenSSH */
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('SSH tunnel timed out. Verify known_hosts and SSH agent authentication.')
  } catch (e) {
    await closeEngineConnections()
    throw e
  }
}
export async function engineConnection(): Promise<{
  settings: Settings
  address: string
  env: NodeJS.ProcessEnv
}> {
  const settings = await getSettings()
  let address = await endpoint(settings)
  if (address.startsWith('ssh://')) address = await sshEndpoint(address, settings)
  const tls = settings.tlsCertPath
  return {
    settings,
    address,
    env: {
      DOCKER_HOST: address,
      // The CLI generates feature Dockerfiles outside the Compose build context.
      COMPOSE_BAKE: 'false',
      // The execution review authorizes this build. Bake 0.38+ otherwise rejects
      // the official CLI's feature Dockerfiles outside the original context.
      BUILDX_BAKE_ENTITLEMENTS_FS: '0',
      DOCKER_CONTEXT: '',
      DOCKER_TLS_VERIFY: tls ? '1' : '',
      DOCKER_CERT_PATH: tls,
      CONTAINER_HOST: settings.engine === 'podman' ? address : '',
      CONTAINER_CONNECTION: '',
    },
  }
}
export async function docker(): Promise<Docker> {
  const { address, settings } = await engineConnection()
  if (address.startsWith('unix://')) return new Docker({ socketPath: address.slice(7) })
  if (address.startsWith('npipe://'))
    return new Docker({ socketPath: '\\\\.\\pipe\\' + address.split('/').filter(Boolean).at(-1) })
  const url = new URL(address.replace(/^tcp:/, settings.tlsCertPath ? 'https:' : 'http:'))
  const tls = settings.tlsCertPath
  const options: Docker.DockerOptions = {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 2376 : 2375)),
    protocol: url.protocol === 'https:' ? 'https' : 'http',
  }
  if (tls) {
    const [ca, cert, key] = await Promise.all(
      ['ca.pem', 'cert.pem', 'key.pem'].map((name) => fs.readFile(path.join(tls, name))),
    )
    Object.assign(options, { ca, cert, key })
  }
  return new Docker(options)
}
export async function engineRun(args: string[], options: Parameters<typeof run>[2] = {}) {
  const { settings, env } = await engineConnection()
  return run(settings.engine || 'docker', args, { ...options, env: { ...env, ...options.env } })
}
export async function contexts(
  engine?: 'docker' | 'podman',
): Promise<{ name: string; endpoint: string; socketPath?: string }[]> {
  const settings = await getSettings()
  if ((engine ?? settings.engine) === 'podman') {
    const r = await run('podman', ['system', 'connection', 'list', '--format', 'json'], {
      timeout: 10000,
    })
    return (JSON.parse(r.stdout) as { Name: string; URI: string }[]).map((c) => {
      const u = new URL(c.URI)
      return {
        name: c.Name,
        socketPath: u.pathname === '/' ? '' : u.pathname,
        endpoint: `${u.protocol}//${u.username ? u.username + '@' : ''}${u.host}`,
      }
    })
  }
  const r = await run('docker', ['context', 'ls', '--format', '{{json .}}'], { timeout: 10000 })
  return r.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const r = JSON.parse(line)
      return { name: r.Name, endpoint: r.DockerEndpoint }
    })
}
