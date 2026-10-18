// SPDX-License-Identifier: MPL-2.0
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { podmanAdapterSh } from '../shared/podman'
export async function podmanAdapter(): Promise<string> {
  // The CLI spawns executables directly; .cmd shims cannot be used as binaries.
  if (process.platform === 'win32') return 'podman'
  const directory = path.join(app.getPath('userData'), 'engine-adapters')
  await fs.mkdir(directory, { recursive: true })
  const file = path.join(directory, 'podman-cli.sh')
  await fs.writeFile(file, podmanAdapterSh, {
    mode: 0o755,
  })
  return file
}
