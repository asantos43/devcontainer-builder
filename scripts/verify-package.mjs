// SPDX-License-Identifier: MPL-2.0
import fs from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron } from 'playwright'
import os from 'node:os'
import assert from 'node:assert/strict'
async function findApp(root) {
  for (const item of await fs.readdir(root, { withFileTypes: true })) {
    const full = path.join(root, item.name)
    if (item.isDirectory() && item.name.endsWith('.app'))
      return path.join(full, 'Contents', 'MacOS', 'DevContainer Builder')
    if (item.isDirectory()) {
      const found = await findApp(full)
      if (found) return found
    }
  }
}
const executable =
  process.argv[2] ||
  (process.platform === 'darwin'
    ? await findApp('release')
    : process.platform === 'win32'
      ? 'release/win-unpacked/DevContainer Builder.exe'
      : 'release/linux-unpacked/devcontainer-builder')
if (!executable)
  throw new Error('Usage: npm run verify:package -- /absolute/path/to/packaged/executable')
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'dcb-packaged-'))
const application = await electron.launch({
  executablePath: path.resolve(executable),
  args: [],
  env: {
    ...process.env,
    GH_TOKEN: '',
    GITHUB_TOKEN: '',
    ELECTRON_RUN_AS_NODE: undefined,
    DCB_E2E: '1',
    DCB_E2E_USER_DATA: data,
  },
})
try {
  const window = await application.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.getByText('DevContainer Builder', { exact: false }).first().waitFor()
  const result = await application.evaluate(
    ({ app, utilityProcess }) =>
      new Promise((resolve) => {
        const entry = (
          app.getAppPath() + '/node_modules/@devcontainers/cli/devcontainer.js'
        ).replace('app.asar/', 'app.asar.unpacked/')
        const child = utilityProcess.fork(entry, ['--version'], { stdio: 'pipe' })
        const drained = Promise.all(
          [child.stdout, child.stderr].map((stream) =>
            stream
              ? new Promise((resolve) => {
                  stream.once('end', resolve)
                  stream.once('close', resolve)
                })
              : Promise.resolve(),
          ),
        )
        let output = ''
        child.stdout?.on('data', (b) => {
          output += String(b)
        })
        child.stderr?.on('data', (b) => {
          output += String(b)
        })
        child.on('exit', (code) => {
          void drained.then(() => resolve({ code, output }))
        })
      }),
  )
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /\d+\.\d+\.\d+/)
  const updater = await window.evaluate(async () => {
    try {
      await window.builder.maintenance.update('install')
      return 'Unexpected install without download'
    } catch (error) {
      return String(error)
    }
  })
  assert.match(updater, /Download an update before installing it/, updater)
  console.log(
    `PASS: packaged updater loads without a token and blocks installation before download`,
  )
  console.log(`PASS: packaged window and CLI ${result.output.trim()}`)
} finally {
  await application.close()
  await fs.rm(data, { recursive: true, force: true })
}
