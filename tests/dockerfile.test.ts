// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest'
import {
  appendBlock,
  deleteBlock,
  editBlock,
  moveBlock,
  parseDockerfile,
} from '../src/shared/dockerfile'

describe('lossless Dockerfile model', () => {
  const fixtures = [
    '# syntax=docker/dockerfile:1\n# existing documentation\nFROM ubuntu:24.04\n\n# RUN disabled-command\nRUN echo "# literal"\n',
    '# escape=`\r\nFROM mcr.microsoft.com/windows/servercore:ltsc2022\r\nRUN echo first `\r\n    && echo second\r\n',
    'FROM alpine AS base\n# first stage\nRUN echo ok\nFROM base AS final\nCOPY --from=base /tmp /tmp\n',
    '# untouched\nFROM alpine',
    '\n\n# only a comment\n\n',
  ]
  for (const [index, source] of fixtures.entries())
    it(`round-trips fixture ${index} byte for byte`, () =>
      expect(
        parseDockerfile(source)
          .blocks.map((b) => b.raw)
          .join(''),
      ).toBe(source))
  it('edits a single instruction without changing unrelated bytes', () => {
    const s = '# base\r\nFROM ubuntu:24.04\r\n\r\n# install\r\nRUN echo old\r\n'
    const block = parseDockerfile(s).blocks.find((b) => b.instruction === 'RUN')!
    expect(editBlock(s, block.id, 'RUN echo new')).toBe(s.replace('RUN echo old', 'RUN echo new'))
  })
  it('keeps disabled instructions as comments', () => {
    const s = '# RUN rm -rf /app\nFROM alpine\n'
    expect(parseDockerfile(s).blocks[0].kind).toBe('comment')
    expect(parseDockerfile(s).blocks[0].raw).toBe('# RUN rm -rf /app\n')
  })
  it('pins parser directives when reordering', () => {
    const s = '# syntax=docker/dockerfile:1\nFROM alpine\n'
    const doc = parseDockerfile(s)
    expect(moveBlock(s, doc.blocks[1].id, -1)).toBe(s)
    expect(() => deleteBlock(s, doc.blocks[0].id)).toThrow()
  })
  it('moves explicitly associated preceding comments with an instruction', () => {
    const s = 'FROM alpine\nRUN echo first\n# second documentation\nRUN echo second\n'
    const b = parseDockerfile(s).blocks.at(-1)!
    expect(moveBlock(s, b.id, -1, true)).toBe(
      'FROM alpine\n# second documentation\nRUN echo second\nRUN echo first\n',
    )
  })
  it('preserves comments when removing an instruction by default', () => {
    const s = 'FROM alpine\n# keep me\nRUN echo old\n'
    const b = parseDockerfile(s).blocks.at(-1)!
    expect(deleteBlock(s, b.id)).toBe('FROM alpine\n# keep me\n')
    expect(deleteBlock(s, b.id, true)).toBe('FROM alpine\n')
  })
  it('retains literal hashes and multiline shell content', () => {
    const s = 'FROM alpine\nRUN echo "# text" \\\n && echo done\n'
    const doc = parseDockerfile(s)
    expect(doc.safe).toBe(true)
    expect(doc.blocks).toHaveLength(2)
    expect(doc.blocks[1].raw).toContain('# text')
  })
  it('requires source editing for heredocs and unknown syntax', () => {
    for (const s of [
      'FROM alpine\nRUN <<EOF\necho ok\nEOF\n',
      'FROM alpine\nUNKNOWN something\n',
    ]) {
      expect(parseDockerfile(s).safe).toBe(false)
      expect(() => editBlock(s, '0', 'FROM other')).toThrow()
      expect(
        parseDockerfile(s)
          .blocks.map((b) => b.raw)
          .join(''),
      ).toBe(s)
    }
  })
  it('adds multiline comments without changing old content', () => {
    const s = 'FROM alpine'
    expect(appendBlock(s, '# new\n# documentation')).toBe('FROM alpine\n# new\n# documentation\n')
  })
})
