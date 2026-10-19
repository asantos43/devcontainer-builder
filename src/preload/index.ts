// SPDX-License-Identifier: MPL-2.0
import { contextBridge, ipcRenderer } from 'electron'
import type { BuilderAPI, OperationEvent } from '../shared/types'
const invoke = <T>(channel: string, value?: unknown): Promise<T> =>
  ipcRenderer.invoke(channel, value)
const api: BuilderAPI = {
  extensions: { list: () => invoke('extensions:list'), import: () => invoke('extensions:import') },
  vault: {
    list: () => invoke('vault:list'),
    store: (name, value) => invoke('vault:store', { name, value }),
    remove: (name) => invoke('vault:remove', name),
    registry: (name, server, username) => invoke('vault:registry', { name, server, username }),
  },
  library: {
    list: () => invoke('library:list'),
    preview: (source) => invoke('library:preview', source),
    fromProject: (id) => invoke('library:fromProject', id),
    destination: (id) => invoke('library:destination', id),
    apply: (id, destination, config, options) =>
      invoke('library:apply', { id, destination, config, options }),
    save: (id, name, description) => invoke('library:save', { id, name, description }),
    publish: (id, registry, namespace) => invoke('library:publish', { id, registry, namespace }),
  },
  settings: { get: () => invoke('settings:get'), save: (value) => invoke('settings:save', value) },
  maintenance: {
    registryLogin: (server, username, password) =>
      invoke('maintenance:registryLogin', { server, username, password }),
    registryLogout: (server) => invoke('maintenance:registryLogout', server),
    applyTemplate: (reference, options) =>
      invoke('maintenance:applyTemplate', { reference, options }),
    featureVersions: (id) => invoke('maintenance:featureVersions', id),
    featureLock: (id) => invoke('maintenance:featureLock', id),
    saveFeatureLock: (id, content) => invoke('maintenance:saveFeatureLock', { id, content }),
    compare: () => invoke('maintenance:compare'),
    cloneVolume: (name, url, branch, credential) =>
      invoke('maintenance:cloneVolume', { name, url, branch, credential }),
    backupVolume: (name) => invoke('maintenance:backupVolume', name),
    restoreVolume: (name) => invoke('maintenance:restoreVolume', name),
    scan: (id, kind, target) => invoke('maintenance:scan', { id, kind, target }),
    update: (action) => invoke('maintenance:update', action),
  },
  projects: {
    scripts: (id) => invoke('projects:scripts', id),
    pickDirectory: () => invoke('projects:pickDirectory'),
    open: () => invoke('projects:open'),
    openRecent: (root) => invoke('projects:openRecent', root),
    create: (data) => invoke('projects:create', data),
    save: (project) => invoke('projects:save', project),
    saveAs: (project) => invoke('projects:saveAs', project),
    reload: (id) => invoke('projects:reload', id),
    changed: (id) => invoke('projects:changed', id),
  },
  system: {
    capabilities: () => invoke('system:capabilities'),
    contexts: (engine) => invoke('system:contexts', engine),
  },
  git: {
    info: (id) => invoke('git:info', id),
    login: () => invoke('git:login'),
    createRemote: (id, owner, name, privateRepo) =>
      invoke('git:createRemote', { id, owner, name, privateRepo }),
    commit: (id, message, files) => invoke('git:commit', { id, message, files }),
    push: (id) => invoke('git:push', id),
  },
  images: {
    search: (query, page) => invoke('images:search', { query, page }),
    tags: (image, page) => invoke('images:tags', { image, page }),
  },
  docker: {
    volumes: () => invoke('docker:volumes'),
    createVolume: (name) => invoke('docker:createVolume', name),
  },
  runtime: {
    start: (id) => invoke('runtime:start', id),
    stop: (id) => invoke('runtime:stop', id),
    state: (id) => invoke('runtime:state', id),
    logs: (id) => invoke('runtime:logs', id),
    test: (id) => invoke('runtime:test', id),
    report: (id) => invoke('runtime:report', id),
    clean: (id) => invoke('runtime:clean', id),
    stats: (id) => invoke('runtime:stats', id),
  },
  terminal: {
    open: (id) => invoke('terminal:open', id),
    write: (session, data) => invoke('terminal:write', { session, data }),
    resize: (session, cols, rows) => invoke('terminal:resize', { session, cols, rows }),
    close: (session) => invoke('terminal:close', session),
  },
  operations: { cancel: (id) => invoke('operations:cancel', id) },
  exports: {
    plan: (id) => invoke('exports:plan', id),
    zip: (id, files) => invoke('exports:zip', { id, files }),
    log: (text) => invoke('exports:log', text),
  },
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: OperationEvent): void =>
      listener(value)
    ipcRenderer.on('operation:event', handler)
    return () => ipcRenderer.removeListener('operation:event', handler)
  },
}
contextBridge.exposeInMainWorld('builder', api)
