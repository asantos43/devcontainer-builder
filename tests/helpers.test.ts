// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { helperScripts } from '../src/shared/helpers'
const exec = promisify(execFile)
let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "dcb space's-"))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})
describe('generated helper scripts', () => {
  it.skipIf(process.platform === 'win32')(
    'executes scripts safely with spaces, quotes, engine overrides and shell arguments',
    async () => {
      const config = ".devcontainer/team's config.json"
      const binary = path.join(root, 'bin')
      await fs.mkdir(binary)
      for (const name of ['docker', 'podman', 'devcontainer'])
        await fs.writeFile(
          path.join(binary, name),
          `#!${process.execPath}\nconst fs = require('node:fs'); fs.appendFileSync(process.env.DCB_TEST_LOG, JSON.stringify({ bin: require('node:path').basename(process.argv[1]), args: process.argv.slice(2) }) + '\\n'); if (process.argv[2] === 'ps') console.log('owned-container');\n`,
          { mode: 0o755 },
        )
      for (const script of helperScripts(config, 'docker', {
        dockerEndpoint: 'unix:///tmp/custom-engine.sock',
        composePath: "compose ' provider",
      })) {
        await fs.mkdir(path.dirname(path.join(root, script.name)), { recursive: true })
        await fs.writeFile(path.join(root, script.name), script.text, { mode: script.mode })
      }
      const log = path.join(root, 'calls.jsonl')
      const env = {
        ...process.env,
        PATH: binary + ':' + process.env.PATH,
        DCB_ENGINE: 'podman',
        DOCKER_HOST: '',
        DCB_TEST_LOG: log,
      }
      await exec('sh', [path.join(root, 'devcontainer-start.sh'), '--remove-existing-container'], {
        env,
      })
      await exec(
        'sh',
        [path.join(root, 'devcontainer-shell.sh'), '/bin/sh', '-c', 'printf "quoted args"'],
        { env },
      )
      await exec('sh', [path.join(root, 'devcontainer-stop.sh')], { env })
      const calls = (await fs.readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      const label =
        'devcontainer-builder.project=' +
        createHash('sha256')
          .update(root + '\0' + config)
          .digest('hex')
          .slice(0, 24)
      expect(calls[0].args).toContain(path.join(root, config))
      expect(calls[0].args).toContain(label)
      expect(calls[0].args).toContain(path.join(root, '.devcontainer/builder-podman.sh'))
      expect(calls[0].args).toContain("compose ' provider")
      expect(calls[0].args.at(-1)).toBe('--remove-existing-container')
      expect(calls[1].args.slice(-3)).toEqual(['/bin/sh', '-c', 'printf "quoted args"'])
      expect(calls[2]).toEqual({ bin: 'podman', args: ['ps', '-aq', '--filter', 'label=' + label] })
      expect(calls.at(-1)).toEqual({ bin: 'podman', args: ['stop', 'owned-container'] })
    },
  )
})
