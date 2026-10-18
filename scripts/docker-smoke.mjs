// SPDX-License-Identifier: MPL-2.0
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import Docker from 'dockerode'
const require = createRequire(import.meta.url)
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-smoke-'))
const label = `devcontainer-builder.smoke=${randomUUID()}`
const withFeature = process.env.DCB_FEATURE_SMOKE === '1'
function run(binary, args, timeout = 600000) {
  return new Promise((resolve, reject) => {
    let output = ''
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => child.kill(), timeout)
    child.stdout.on('data', (b) => {
      output += String(b)
      process.stdout.write(b)
    })
    child.stderr.on('data', (b) => process.stderr.write(b))
    child.on('error', reject)
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code) reject(new Error(`${binary} exited ${code}`))
      else resolve(output)
    })
  })
}
const endpoint =
  process.env.DOCKER_HOST ||
  (await run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])).trim()
const docker = new Docker({
  socketPath: endpoint.startsWith('unix://') ? endpoint.slice(7) : '\\\\.\\pipe\\docker_engine',
})
const volume = `dcb-smoke-${randomUUID()}`
try {
  await docker.ping()
  await docker.createVolume({ Name: volume, Labels: { 'devcontainer-builder.smoke': 'true' } })
  await fs.mkdir(path.join(root, '.devcontainer'))
  await fs.writeFile(path.join(root, 'host.txt'), 'host workspace\n')
  await fs.writeFile(
    path.join(root, '.devcontainer', 'Dockerfile'),
    `# syntax=docker/dockerfile:1\n# Existing documentation must stay intact.\nFROM ${withFeature ? 'mcr.microsoft.com/devcontainers/base:ubuntu' : 'alpine:3.22'}\nRUN printf image-ready > /image-ready\n`,
  )
  const config = {
    name: 'Builder smoke',
    build: { dockerfile: 'Dockerfile', context: '..' },
    workspaceMount: 'type=bind,source=${localWorkspaceFolder},target=/workspace',
    workspaceFolder: '/workspace',
    remoteUser: withFeature ? 'vscode' : 'root',
    ...(withFeature
      ? { features: { 'ghcr.io/devcontainers/features/docker-outside-of-docker:1': {} } }
      : {}),
    mounts: [`type=volume,source=${volume},target=/persistent`],
    postCreateCommand: 'printf lifecycle-ready > /workspace/ready.txt',
    overrideCommand: true,
  }
  await fs.writeFile(
    path.join(root, '.devcontainer', 'devcontainer.json'),
    JSON.stringify(config, null, 2),
  )
  const output = await run(process.execPath, [
    require.resolve('@devcontainers/cli/devcontainer.js'),
    'up',
    '--workspace-folder',
    root,
    '--id-label',
    label,
  ])
  const result = output
    .trim()
    .split('\n')
    .reverse()
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return {}
      }
    })
    .find((r) => r.containerId)
  assert.ok(result?.containerId, 'CLI returns container ID')
  const container = docker.getContainer(result.containerId)
  const inspect = await container.inspect()
  assert.ok(inspect.State.Running)
  assert.ok(inspect.Mounts.some((m) => m.Name === volume))
  assert.equal(await fs.readFile(path.join(root, 'ready.txt'), 'utf8'), 'lifecycle-ready')
  const exec = await container.exec({
    User: 'root',
    Cmd: [
      '/bin/sh',
      '-c',
      'test -f /image-ready && cat /workspace/host.txt && printf persistent > /persistent/check',
    ],
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({})
  stream.resume()
  await new Promise((resolve, reject) => {
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  assert.equal((await exec.inspect()).ExitCode, 0)
  if (withFeature) {
    const probe = await container.exec({
      Cmd: ['/bin/sh', '-c', 'docker version --format "{{.Server.Version}}"'],
      User: 'vscode',
      AttachStdout: true,
      AttachStderr: true,
    })
    const probeStream = await probe.start({})
    probeStream.resume()
    await new Promise((resolve, reject) => {
      probeStream.on('end', resolve)
      probeStream.on('error', reject)
    })
    assert.equal(
      (await probe.inspect()).ExitCode,
      0,
      'Non-root user can access the host Docker daemon',
    )
    console.log('PASS: official Docker outside of Docker Feature with non-root host access.')
  }
  console.log('\nPASS: CLI build, lifecycle, bind workspace, named volume and Dockerode exec.')
} finally {
  const containers = await docker
    .listContainers({ all: true, filters: JSON.stringify({ label: [label] }) })
    .catch(() => [])
  for (const container of containers)
    await docker.getContainer(container.Id).remove({ force: true, v: false })
  await docker
    .getVolume(volume)
    .remove()
    .catch(() => {})
  await fs.rm(root, { recursive: true, force: true })
}
