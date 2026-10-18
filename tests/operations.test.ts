// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest'
import { run } from '../src/main/operations'
describe('credential subprocesses', () => {
  it('sends credentials over stdin and redacts output and errors', async () => {
    const secret = 'dummy-registry-password-12345'
    const output: string[] = []
    const result = await run(
      process.execPath,
      ['-e', 'process.stdin.on("data", b => process.stdout.write(b))'],
      { input: secret, sensitive: [secret], output: (value) => output.push(value) },
    )
    expect(result.stdout).toBe('[redacted]')
    expect(output.join('')).not.toContain(secret)
    await expect(
      run(
        process.execPath,
        ['-e', 'process.stdin.on("data", b => { process.stderr.write(b); process.exitCode=1 })'],
        { input: secret, sensitive: [secret] },
      ),
    ).rejects.toThrow('[redacted]')
  })
})
