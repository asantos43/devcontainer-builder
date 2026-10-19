// SPDX-License-Identifier: MPL-2.0
export interface CatalogTemplate {
  id: string
  name: string
  description: string
  prerequisites: string
  image: string
  user: string
  compose?: boolean
}
export const templateCatalog: CatalogTemplate[] = [
  {
    id: 'node',
    name: 'Node.js / TypeScript',
    description: 'Node.js, npm and TypeScript projects',
    prerequisites: 'Docker or Podman; registry access',
    image: 'mcr.microsoft.com/devcontainers/javascript-node:22-bookworm',
    user: 'node',
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Python and pip development',
    prerequisites: 'Docker or Podman; registry access',
    image: 'mcr.microsoft.com/devcontainers/python:3.12-bookworm',
    user: 'vscode',
  },
  {
    id: 'go',
    name: 'Go',
    description: 'Go compiler and tools',
    prerequisites: 'Docker or Podman; registry access',
    image: 'mcr.microsoft.com/devcontainers/go:1-bookworm',
    user: 'vscode',
  },
  {
    id: 'java',
    name: 'Java',
    description: 'Java development kit',
    prerequisites: 'Docker or Podman; registry access',
    image: 'mcr.microsoft.com/devcontainers/java:21-bookworm',
    user: 'vscode',
  },
  {
    id: 'dotnet',
    name: '.NET',
    description: '.NET SDK development',
    prerequisites: 'Docker or Podman; registry access',
    image: 'mcr.microsoft.com/devcontainers/dotnet:8.0-bookworm',
    user: 'vscode',
  },
  {
    id: 'rust',
    name: 'Rust',
    description: 'Rust compiler and Cargo',
    prerequisites: 'Docker or Podman; registry access',
    image: 'mcr.microsoft.com/devcontainers/rust:1-bookworm',
    user: 'vscode',
  },
  {
    id: 'php',
    name: 'PHP',
    description: 'PHP development',
    prerequisites: 'Docker or Podman; registry access',
    image: 'mcr.microsoft.com/devcontainers/php:8.3-bookworm',
    user: 'vscode',
  },
  {
    id: 'ruby',
    name: 'Ruby',
    description: 'Ruby and Bundler development',
    prerequisites: 'Docker or Podman; registry access',
    image: 'mcr.microsoft.com/devcontainers/ruby:3.3-bookworm',
    user: 'vscode',
  },
  {
    id: 'compose',
    name: 'Compose + PostgreSQL',
    description: 'Development service with a PostgreSQL database',
    prerequisites: 'Docker or Podman and a Compose provider',
    image: 'mcr.microsoft.com/devcontainers/base:ubuntu',
    user: 'vscode',
    compose: true,
  },
]
export interface TemplatePreview {
  id: string
  name: string
  description: string
  prerequisites: string
  configurations: string[]
  files: { path: string; size: number }[]
  excluded: string[]
  options: Record<string, { description?: string; default?: string; enum?: string[] }>
}
export interface ImportSource {
  kind: 'folder' | 'zip' | 'git' | 'catalog' | 'saved'
  reference?: string
  revision?: string
  subfolder?: string
}
export interface ImportDestination {
  id: string
  path: string
  conflicts: string[]
}
