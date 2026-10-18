// SPDX-License-Identifier: MPL-2.0
export type Locale = 'en' | 'pt-BR'
export type Config = Record<string, unknown>
export interface TestCommand {
  id: string
  name: string
  command: string
  cwd?: string
  timeout: number
  expectedCode: number
}
export interface Mount {
  type: 'bind' | 'volume'
  source: string
  target: string
  readOnly: boolean
}
export interface Auxiliary {
  version: 1
  tests: TestCommand[]
}
export interface Project {
  id: string
  root: string
  configPath: string
  dockerfilePath?: string
  configText: string
  dockerfile: string
  auxiliary: Auxiliary
  composeFiles?: Record<string, string>
  files: string[]
  baseline: {
    configText: string
    dockerfile: string
    auxiliaryText: string
    composeFiles?: Record<string, string>
  }
}
export interface WizardData {
  name: string
  root: string
  template: 'empty' | 'node' | 'python' | 'ubuntu'
  repository: 'none' | 'existing' | 'local' | 'github' | 'clone'
  repositoryUrl: string
  branch: string
  githubOwner: string
  githubName: string
  githubPrivate: boolean
  description: string
  base: 'image' | 'dockerfile'
  image: string
  remoteUser: string
  workspaceFolder: string
  features: Record<string, unknown>
  mounts: Mount[]
  ports: number[]
  env: Record<string, string>
  postCreateCommand: string
}
export interface Settings {
  locale: Locale
  theme: string
  engine: 'docker' | 'podman'
  composePath: string
  tlsCertPath: string
  sshSocketPath: string
  autoUpdate: boolean
  dockerEndpoint: string
  shell: string
  recent: string[]
}
export interface RuntimeState {
  containerId?: string
  status: string
  workspaceFolder?: string
  remoteUser?: string
}
export interface OperationEvent {
  id: string
  kind: 'output' | 'done' | 'error'
  text: string
  projectId?: string
  channel: 'build' | 'git' | 'tests' | 'logs' | 'terminal'
}
export interface TestResult {
  name: string
  status: 'passed' | 'failed'
  exitCode: number
  expectedCode: number
  output: string
  duration: number
}
export interface Diagnostic {
  level: 'error' | 'warning'
  message: string
}
export interface GitInfo {
  branch: string
  remotes: string
  status: string
  account: string
}
export interface ExportEntry {
  path: string
  size: number
  excluded: boolean
  reason?: string
}
export interface ExportPlan {
  entries: ExportEntry[]
  dependencies: string[]
}
export interface ImageResult {
  name: string
  description: string
  stars: number
  official: boolean
}
export interface ImagePage {
  results: ImageResult[]
  page: number
  hasNext: boolean
}
export interface TagPage {
  tags: string[]
  page: number
  hasNext: boolean
}
export interface Capability {
  name: string
  ok: boolean
  detail: string
}
export interface BuilderAPI {
  settings: { get(): Promise<Settings>; save(value: Settings): Promise<Settings> }
  maintenance: {
    registryLogin(server: string, username: string, password: string): Promise<void>
    registryLogout(server: string): Promise<void>
    applyTemplate(reference: string, options: Record<string, string>): Promise<Project | null>
    featureVersions(id: string): Promise<string>
    featureLock(id: string): Promise<string>
    saveFeatureLock(id: string, content: string): Promise<void>
    compare(): Promise<string | null>
    cloneVolume(name: string, url: string, branch: string): Promise<string>
    backupVolume(name: string): Promise<string | null>
    restoreVolume(name: string): Promise<string | null>
    scan(id: string, kind: 'sbom' | 'vulnerabilities'): Promise<string>
    update(action: 'check' | 'download' | 'install'): Promise<string>
  }
  projects: {
    scripts(id: string): Promise<string[]>
    pickDirectory(): Promise<string | null>
    open(): Promise<Project | null>
    openRecent(root: string): Promise<Project>
    create(data: WizardData): Promise<Project>
    save(project: Project): Promise<Project>
    saveAs(project: Project): Promise<Project | null>
    reload(id: string): Promise<Project>
    changed(id: string): Promise<boolean>
  }
  system: {
    capabilities(): Promise<Capability[]>
    contexts(
      engine?: 'docker' | 'podman',
    ): Promise<{ name: string; endpoint: string; socketPath?: string }[]>
  }
  git: {
    info(id: string): Promise<GitInfo>
    login(): Promise<void>
    createRemote(id: string, owner: string, name: string, privateRepo: boolean): Promise<void>
    commit(id: string, message: string, files: string[]): Promise<void>
    push(id: string): Promise<void>
  }
  images: {
    search(query: string, page: number): Promise<ImagePage>
    tags(image: string, page: number): Promise<TagPage>
  }
  docker: { volumes(): Promise<string[]>; createVolume(name: string): Promise<string> }
  runtime: {
    start(id: string): Promise<string>
    stop(id: string): Promise<void>
    state(id: string): Promise<RuntimeState>
    logs(id: string): Promise<string>
    test(id: string): Promise<string>
    report(id: string): Promise<void>
    clean(id: string): Promise<void>
    stats(id: string): Promise<string>
  }
  terminal: {
    open(id: string): Promise<string>
    write(session: string, data: string): Promise<void>
    resize(session: string, cols: number, rows: number): Promise<void>
    close(session: string): Promise<void>
  }
  operations: { cancel(id: string): Promise<void> }
  exports: {
    plan(id: string): Promise<ExportPlan>
    zip(id: string, files: string[]): Promise<string | null>
    log(text: string): Promise<void>
  }
  onEvent(listener: (event: OperationEvent) => void): () => void
}
declare global {
  interface Window {
    builder: BuilderAPI
  }
}
