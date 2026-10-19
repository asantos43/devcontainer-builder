// SPDX-License-Identifier: MPL-2.0
import os from 'node:os'
import fs from 'node:fs/promises'
import { hostProblems, requirements } from '../src/shared/requirements.ts'
const facts = {
  platform: process.platform,
  arch: process.arch,
  release: os.release(),
  memory: os.totalmem(),
  glibc: process.report?.getReport().header.glibcVersionRuntime,
}
const problems = hostProblems(facts)
const stat = await fs.statfs('.')
if (stat.bavail * stat.bsize < requirements.diskBytes)
  problems.push('Reserve at least 1 GiB for the application/build, plus workspace/image storage.')
console.log(JSON.stringify({ facts, requirements, problems }, null, 2))
if (problems.length) process.exitCode = 1
