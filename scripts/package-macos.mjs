// SPDX-License-Identifier: MPL-2.0
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { build, Platform, Arch } = require('electron-builder')
if (process.platform !== 'darwin') throw new Error('Run macOS packaging on a macOS machine.')
const architecture = process.argv[2] || process.arch
if (!['x64', 'arm64'].includes(architecture)) throw new Error('Expected x64 or arm64.')
// GitHub secrets that are not configured are passed as empty strings.
// electron-builder treats an empty CSC_LINK as a certificate, so omit it.
for (const name of [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
]) {
  if (!process.env[name]) delete process.env[name]
}
if (!process.env.CSC_LINK) process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
await build({ targets: Platform.MAC.createTarget(['dmg'], Arch[architecture]), publish: 'never' })
