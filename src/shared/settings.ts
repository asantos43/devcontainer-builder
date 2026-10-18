// SPDX-License-Identifier: MPL-2.0
import { z } from 'zod'
import type { Settings } from './types'
export const defaultSettings: Settings = {
  locale: 'pt-BR',
  theme: 'dark-modern',
  engine: 'docker',
  dockerEndpoint: '',
  composePath: '',
  tlsCertPath: '',
  sshSocketPath: '',
  autoUpdate: false,
  shell: '/bin/bash',
  recent: [],
}
export function validEndpoint(value: string): boolean {
  if (!value) return true
  if (/[\r\n\0]/.test(value)) return false
  if (value.startsWith('unix://')) return value.slice(7).startsWith('/')
  if (value.startsWith('npipe://')) return /^npipe:\/\/\/\/\.\/pipe\/[\w.-]+$/.test(value)
  try {
    const u = new URL(value)
    return (
      ['ssh:', 'https:', 'tcp:', 'http:'].includes(u.protocol) &&
      !!u.hostname &&
      !u.password &&
      !u.search &&
      !u.hash &&
      (u.protocol === 'ssh:' || !u.username) &&
      (u.pathname === '' || u.pathname === '/')
    )
  } catch {
    return false
  }
}
export const settingsSchema = z.object({
  locale: z.enum(['en', 'pt-BR']).default('pt-BR'),
  theme: z.string().max(80).default('dark-modern'),
  engine: z.enum(['docker', 'podman']).default('docker'),
  dockerEndpoint: z.string().max(4096).refine(validEndpoint),
  composePath: z.string().max(4096).default(''),
  tlsCertPath: z.string().max(4096).default(''),
  sshSocketPath: z
    .string()
    .max(4096)
    .refine((v) => !v || /^\/[\w/.-]+$/.test(v))
    .default(''),
  autoUpdate: z.boolean().default(false),
  shell: z.string().max(4096),
  recent: z.array(z.string().max(4096)).max(12),
})
