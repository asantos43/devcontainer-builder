// SPDX-License-Identifier: MPL-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  Circle,
  CircleHelp,
  Container,
  Copy,
  Download,
  FileCode2,
  FilePlus2,
  FolderOpen,
  GitBranch,
  LayoutTemplate,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  Square,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react'
import type { Capability, OperationEvent, Project, Settings } from '../../shared/types'
import { patchConfig, readConfig, validateConfig } from '../../shared/config'
import { Editors, tabLabel, tabs, type Tab } from './Editors'
import { Wizard } from './Wizard'
import { Diff, Field, LocaleContext, Modal, Notice, Section, useT } from './ui'
import { InteractiveTerminal, OutputTerminal } from './Panels'

import { defaultSettings as fallback } from '../../shared/settings'
import { themes } from '../../shared/themes'
import { ThemeProvider, useImportedThemes } from './themes'
import { ApplicationTools } from './Roadmap'
import { useRuntimeState } from './useRuntimeState'
import { TemplateLibrary } from './Library'
function isDirty(p: Project | undefined): boolean {
  if (!p) return false
  let aux
  try {
    aux = JSON.parse(p.baseline.auxiliaryText || '{"version":1,"tests":[]}')
  } catch {
    aux = {}
  }
  return (
    p.configText !== p.baseline.configText ||
    p.dockerfile !== p.baseline.dockerfile ||
    JSON.stringify(p.composeFiles ?? {}) !== JSON.stringify(p.baseline.composeFiles ?? {}) ||
    JSON.stringify(p.auxiliary) !== JSON.stringify(aux)
  )
}
export function App() {
  const [settings, setSettings] = useState<Settings>(fallback)
  useEffect(() => {
    void window.builder.settings.get().then(setSettings)
  }, [])
  return (
    <ThemeProvider id={settings.theme}>
      <LocaleContext.Provider value={settings.locale}>
        <Workbench settings={settings} setSettings={setSettings} />
      </LocaleContext.Provider>
    </ThemeProvider>
  )
}
function Workbench({
  settings,
  setSettings,
}: {
  settings: Settings
  setSettings: (value: Settings) => void
}) {
  const t = useT()
  const [project, setProject] = useState<Project>()
  const [tab, setTab] = useState<Tab>('general')
  const [wizard, setWizard] = useState(false)
  const [library, setLibrary] = useState(false)
  const [preferences, setPreferences] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveReview, setSaveReview] = useState(false)
  const [external, setExternal] = useState(false)
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const { state, refreshState } = useRuntimeState(
    project?.id,
    JSON.stringify([
      settings.engine,
      settings.dockerEndpoint,
      settings.tlsCertPath,
      settings.sshSocketPath,
      settings.composePath,
    ]),
  )
  const [panel, setPanel] = useState<'terminal' | 'logs' | 'problems' | 'tests'>('logs')
  const [output, setOutput] = useState('')
  const [testOutput, setTestOutput] = useState('')
  const [active, setActive] = useState<{ id: string; channel: OperationEvent['channel'] }[]>([])
  const [trust, setTrust] = useState<'start' | 'test'>()
  const [stats, setStats] = useState('')
  const [panelHeight, setPanelHeight] = useState(245)
  const drag = useRef<{ y: number; height: number } | undefined>(undefined)
  const [branch, setBranch] = useState('—')
  const dirty = isDirty(project)
  const c = project ? readConfig(project.configText).config : {}
  const diagnostics = project ? validateConfig(project.configText) : []
  const runtimeBusy = busy || active.some((o) => o.channel === 'build' || o.channel === 'tests')
  const canStart = ['not-created', 'created', 'exited'].includes(state.status)
  const canStop = ['running', 'paused', 'restarting'].includes(state.status)
  const canTest = !['checking', 'unavailable', 'removing'].includes(state.status)
  const showError = useCallback((value: string) => {
    setError(value)
  }, [])
  const run = useCallback((fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    void fn()
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false))
  }, [])
  useEffect(
    () =>
      window.builder.onEvent((event) => {
        if (event.channel === 'terminal') return
        const text = (event.kind === 'output' ? '' : `\n[${event.kind}] `) + event.text
        if (event.channel === 'tests') setTestOutput((v) => (v + text).slice(-500000))
        else setOutput((v) => (v + text).slice(-500000))
        if (event.kind === 'output' && event.id !== 'github-login')
          setActive((v) =>
            v.some((op) => op.id === event.id)
              ? v
              : [...v, { id: event.id, channel: event.channel }],
          )
        if (event.kind !== 'output') {
          setActive((v) => v.filter((op) => op.id !== event.id))
          if (event.kind === 'error') setError(event.text)
          void refreshState()
        }
      }),
    [refreshState],
  )
  useEffect(() => {
    const check = () => {
      if (project)
        void window.builder.projects
          .changed(project.id)
          .then(setExternal)
          .catch((e) => setError(String(e)))
    }
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [project?.id])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  function canLeave() {
    return (
      !dirty || window.confirm(t('Discard unsaved changes?', 'Descartar alterações não salvas?'))
    )
  }
  async function opened(p: Project | null) {
    if (!p) return
    setProject(p)
    setTab('general')
    setPreferences(false)
    setExternal(false)
    setSettings(await window.builder.settings.get())
    setMessage(t('Project opened', 'Projeto aberto'))
    void window.builder.git
      .info(p.id)
      .then((info) => setBranch(info.branch || '—'))
      .catch(() => setBranch('—'))
  }
  function open() {
    if (canLeave()) run(async () => opened(await window.builder.projects.open()))
  }
  function openLibrary() {
    if (canLeave()) {
      setWizard(false)
      setLibrary(true)
    }
  }
  function newProject() {
    if (canLeave()) {
      setWizard(true)
      setPreferences(false)
    }
  }
  function save() {
    if (!project) return
    if (dirty) setSaveReview(true)
    else setMessage(t('No changes to save', 'Nenhuma alteração para salvar'))
  }
  async function persist() {
    if (!project) return
    const p = await window.builder.projects.save(project)
    setProject(p)
    setSaveReview(false)
    setExternal(false)
    setMessage(t('Saved', 'Salvo'))
  }
  const keyboard = useCallback(
    (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 's') {
          event.preventDefault()
          save()
        }
        if (event.key === 'o') {
          event.preventDefault()
          open()
        }
        if (event.key === 'n') {
          event.preventDefault()
          newProject()
        }
      }
    },
    [project, dirty],
  )
  useEffect(() => {
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [keyboard])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 4000)
    return () => clearTimeout(timer)
  }, [message])
  async function startAction(action: 'start' | 'test') {
    if (!project) return
    if (dirty)
      throw new Error(
        t(
          'Save your changes before running the environment.',
          'Salve as alterações antes de executar o ambiente.',
        ),
      )
    setTrust(action)
  }
  async function execute() {
    if (!project || !trust) return
    const action = trust
    setTrust(undefined)
    const id =
      action === 'test'
        ? await window.builder.runtime.test(project.id)
        : await window.builder.runtime.start(project.id)
    setActive((v) =>
      v.some((op) => op.id === id)
        ? v
        : [...v, { id, channel: action === 'test' ? 'tests' : 'build' }],
    )
    setPanel(action === 'test' ? 'tests' : 'logs')
  }
  const iconFor = (value: Tab) =>
    value === 'repository' ? (
      <GitBranch size={14} />
    ) : value === 'dockerfile' || value === 'source' ? (
      <FileCode2 size={14} />
    ) : (
      <Circle size={9} />
    )
  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="brand">
          <Boxes size={18} />
          <span>
            DevContainer <strong>Builder</strong>
          </span>
          <span className="version">0.1</span>
        </div>
        <div className="command-center">
          <SearchGlyph />
          {project
            ? String(c.name ?? 'Dev Container')
            : t('Build your next workspace', 'Construa seu próximo workspace')}
        </div>
        <button
          className="locale-switch"
          onClick={() =>
            run(async () => {
              const next = await window.builder.settings.save({
                ...settings,
                locale: settings.locale === 'en' ? 'pt-BR' : 'en',
              })
              setSettings(next)
            })
          }
        >
          {settings.locale === 'en' ? 'EN' : 'PT-BR'}
        </button>
      </header>
      <div className="workspace">
        <nav className="activity-bar" aria-label={t('Quick access', 'Acesso rápido')}>
          <button
            className={wizard ? 'selected' : ''}
            title={t('New dev container', 'Novo dev container')}
            aria-label={t('New dev container', 'Novo dev container')}
            onClick={newProject}
          >
            <FilePlus2 size={24} />
          </button>
          <button
            title={t('Open dev container', 'Abrir dev container')}
            aria-label={t('Open dev container', 'Abrir dev container')}
            onClick={open}
          >
            <FolderOpen size={24} />
          </button>
          <button
            title={t('Editor', 'Editor')}
            className={project && !preferences ? 'selected' : ''}
            onClick={() => setPreferences(false)}
          >
            <Boxes size={24} />
          </button>
          <button
            title={t('Templates and import', 'Templates e importação')}
            aria-label={t('Templates and import', 'Templates e importação')}
            onClick={openLibrary}
          >
            <LayoutTemplate size={23} />
          </button>
          <div className="activity-spacer" />
          <button
            title={t('Settings', 'Configurações')}
            aria-label={t('Settings', 'Configurações')}
            className={preferences ? 'selected' : ''}
            onClick={() => setPreferences(!preferences)}
          >
            <SettingsIcon size={23} />
          </button>
        </nav>
        <aside className="sidebar">
          <div className="sidebar-title">
            {t('EXPLORER', 'EXPLORADOR')}
            <span>•••</span>
          </div>
          <div className="sidebar-section">
            <ChevronRight size={13} />
            {project
              ? String(c.name ?? 'DEV CONTAINER').toUpperCase()
              : t('NO PROJECT OPEN', 'NENHUM PROJETO ABERTO')}
          </div>
          {project ? (
            <>
              <div className="file-tree">
                <button className="folder-row" onClick={() => setTab('source')}>
                  <ChevronRight size={13} />
                  <FolderOpen size={15} />
                  .devcontainer
                </button>
                <button
                  className={tab === 'source' ? 'active' : ''}
                  onClick={() => {
                    setTab('source')
                    setPreferences(false)
                  }}
                >
                  <FileCode2 size={14} className="yellow-text" />
                  devcontainer.json
                  {project.configText !== project.baseline.configText && (
                    <span className="modified-dot" />
                  )}
                </button>
                {(project.dockerfilePath || project.dockerfile) && (
                  <button
                    className={tab === 'dockerfile' ? 'active' : ''}
                    onClick={() => {
                      setTab('dockerfile')
                      setPreferences(false)
                    }}
                  >
                    <Container size={14} className="blue-text" />
                    Dockerfile
                    {project.dockerfile !== project.baseline.dockerfile && (
                      <span className="modified-dot" />
                    )}
                  </button>
                )}
                <button onClick={() => setTab('tests')}>
                  <FileCode2 size={14} />
                  builder.json
                </button>
              </div>
              <div className="sidebar-section section-gap">
                {t('CONFIGURATION', 'CONFIGURAÇÃO')}
              </div>
              <div className="configuration-nav">
                {tabs.map((value) => (
                  <button
                    className={!preferences && tab === value ? 'active' : ''}
                    key={value}
                    onClick={() => {
                      setTab(value)
                      setPreferences(false)
                    }}
                  >
                    {iconFor(value)}
                    {tabLabel(value, t)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="sidebar-empty">
              <p>
                {t(
                  'Open a project or create a new environment.',
                  'Abra um projeto ou crie um novo ambiente.',
                )}
              </p>
              <button className="primary" onClick={open}>
                {t('Open folder', 'Abrir pasta')}
              </button>
            </div>
          )}
          <div className="sidebar-bottom">
            <span className="eyebrow">DEV CONTAINERS</span>
            <p>{t('One environment. Every machine.', 'Um ambiente. Qualquer máquina.')}</p>
            <span className="tiny muted">MPL-2.0 · v0.1.0</span>
          </div>
        </aside>
        <main className="main-workspace">
          <div className="editor-tabbar">
            <div className="editor-tab">
              <FileCode2 size={14} />
              {preferences
                ? t('Settings', 'Configurações')
                : project
                  ? tabLabel(tab, t)
                  : t('Welcome', 'Bem-vindo')}
              {dirty && <span className="modified-dot" />}
            </div>
          </div>
          <div className="toolbar">
            <div className="breadcrumbs">
              <span>{project ? String(c.name ?? 'workspace') : 'DevContainer Builder'}</span>
              <ChevronRight size={13} />
              <span>
                {preferences
                  ? t('Settings', 'Configurações')
                  : project
                    ? tabLabel(tab, t)
                    : t('Getting started', 'Primeiros passos')}
              </span>
            </div>
            {project && !preferences && (
              <div className="toolbar-actions">
                <button
                  title={t('Save changes', 'Salvar alterações')}
                  disabled={busy}
                  onClick={save}
                >
                  <Save size={14} />
                  {t('Save', 'Salvar')}
                </button>
                <button
                  title={t('Start environment', 'Iniciar ambiente')}
                  disabled={runtimeBusy || !canStart}
                  onClick={() => run(() => startAction('start'))}
                >
                  <Play size={14} />
                  {t('Start', 'Iniciar')}
                </button>
                <button
                  className="success-button"
                  disabled={runtimeBusy || !canTest}
                  onClick={() => run(() => startAction('test'))}
                >
                  <Check size={14} />
                  {t('Test', 'Testar')}
                </button>
                <button
                  className="icon-button"
                  title={t('Stop container', 'Parar container')}
                  aria-label={t('Stop container', 'Parar container')}
                  disabled={runtimeBusy || !canStop}
                  onClick={() =>
                    run(async () => {
                      try {
                        await window.builder.runtime.stop(project.id)
                      } finally {
                        await refreshState()
                      }
                    })
                  }
                >
                  <Square size={14} />
                </button>
              </div>
            )}
          </div>
          {external && (
            <div className="external-bar">
              {t(
                'Files changed on disk. Reload before saving.',
                'Arquivos alterados no disco. Recarregue antes de salvar.',
              )}
              <button
                onClick={() => {
                  if (canLeave())
                    run(async () => opened(await window.builder.projects.reload(project!.id)))
                }}
              >
                {t('Reload', 'Recarregar')}
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError('')}
                title={t('Dismiss', 'Fechar')}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {active.some((op) => op.channel !== 'logs') && (
            <div className="operation-progress">
              <span>
                <Loader2 size={13} className="spin" />
                {t('Operation in progress', 'Operação em andamento')}
              </span>
              {active
                .filter((op) => op.channel !== 'logs')
                .map((op) => (
                  <button
                    key={op.id}
                    onClick={() =>
                      void window.builder.operations.cancel(op.id).catch((e) => setError(String(e)))
                    }
                  >
                    {t('Cancel operation', 'Cancelar operação')}
                  </button>
                ))}
            </div>
          )}
          {message && (
            <div className="toast">
              <Check size={15} />
              {message}
            </div>
          )}
          <div className="editor-scroll">
            {preferences ? (
              <SettingsEditor
                settings={settings}
                change={setSettings}
                capabilities={capabilities}
                setCapabilities={setCapabilities}
                opened={(p) => {
                  if (canLeave()) void opened(p)
                }}
                run={run}
              />
            ) : project ? (
              <div className="editor-content">
                <Editors
                  key={`${project.id}:${tab}`}
                  tab={tab}
                  project={project}
                  update={setProject}
                  patch={(path, value) => {
                    try {
                      setProject({
                        ...project,
                        configText: patchConfig(project.configText, path, value),
                      })
                    } catch (e) {
                      setError(String(e))
                    }
                  }}
                  run={(fn) => {
                    if (tab === 'export' && dirty) {
                      setError(t('Save before exporting.', 'Salve antes de exportar.'))
                      return
                    }
                    run(fn)
                  }}
                />
              </div>
            ) : (
              <div className="welcome">
                <div className="welcome-mark">
                  <Boxes size={54} />
                </div>
                <span className="eyebrow">DEVCONTAINER BUILDER</span>
                <h1>
                  {t('A home for your', 'Um lugar para seu')}
                  <br />
                  <span>{t('development environment.', 'ambiente de desenvolvimento.')}</span>
                </h1>
                <p>
                  {t(
                    'Design, run and share reproducible workspaces. From your first Dockerfile to your team’s next environment.',
                    'Crie, execute e compartilhe workspaces reproduzíveis. Do primeiro Dockerfile ao próximo ambiente da sua equipe.',
                  )}
                </p>
                <div className="welcome-actions">
                  <button className="primary" onClick={newProject}>
                    <PlusGlyph />
                    {t('New dev container', 'Novo dev container')}
                    <ArrowRight size={16} />
                  </button>
                  <button onClick={open}>
                    <FolderOpen size={16} />
                    {t('Open existing', 'Abrir existente')}
                  </button>
                </div>
                <div className="welcome-cards">
                  <div>
                    <LayoutTemplate size={22} />
                    <h3>{t('Start with a guide', 'Comece com um guia')}</h3>
                    <p>
                      {t(
                        'An eight-step wizard takes care of the essentials.',
                        'Um wizard de oito etapas cuida do essencial.',
                      )}
                    </p>
                  </div>
                  <div>
                    <FileCode2 size={22} />
                    <h3>{t('Keep full control', 'Tenha controle total')}</h3>
                    <p>
                      {t(
                        'Visual building blocks and source code, side by side.',
                        'Blocos visuais e código, com todos os detalhes.',
                      )}
                    </p>
                  </div>
                  <div>
                    <TerminalSquare size={22} />
                    <h3>{t('Make sure it works', 'Confira na prática')}</h3>
                    <p>
                      {t(
                        'Build, test and open a shell in your container.',
                        'Construa, teste e abra o shell do container.',
                      )}
                    </p>
                  </div>
                </div>
                {settings.recent.length > 0 && (
                  <div className="recent">
                    <span className="eyebrow">{t('RECENT PROJECTS', 'PROJETOS RECENTES')}</span>
                    {settings.recent.map((root) => (
                      <button
                        key={root}
                        onClick={() =>
                          run(async () => opened(await window.builder.projects.openRecent(root)))
                        }
                      >
                        <FolderOpen size={14} />
                        {root}
                        <ArrowRight size={13} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {project && (
            <section
              className="bottom-panel"
              style={{ height: panelHeight, display: preferences ? 'none' : 'flex' }}
            >
              <div
                className="panel-resizer"
                role="separator"
                aria-label={t('Resize output panel', 'Redimensionar painel de saída')}
                aria-orientation="horizontal"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp')
                    setPanelHeight((h) => Math.min(window.innerHeight * 0.6, h + 20))
                  if (e.key === 'ArrowDown') setPanelHeight((h) => Math.max(140, h - 20))
                }}
                onPointerDown={(e) => {
                  drag.current = { y: e.clientY, height: panelHeight }
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                  if (drag.current)
                    setPanelHeight(
                      Math.max(
                        140,
                        Math.min(
                          window.innerHeight * 0.6,
                          drag.current.height + drag.current.y - e.clientY,
                        ),
                      ),
                    )
                }}
                onPointerUp={() => {
                  drag.current = undefined
                }}
              />
              <header className="panel-header">
                <div className="panel-tabs">
                  {(['terminal', 'logs', 'problems', 'tests'] as const).map((value) => (
                    <button
                      key={value}
                      className={panel === value ? 'active' : ''}
                      onClick={() => setPanel(value)}
                    >
                      {value === 'terminal'
                        ? 'TERMINAL'
                        : value === 'logs'
                          ? 'LOGS'
                          : value === 'problems'
                            ? t('PROBLEMS', 'PROBLEMAS')
                            : t('TESTS', 'TESTES')}
                      {value === 'problems' && diagnostics.length > 0 && (
                        <span className="badge">{diagnostics.length}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="inline">
                  {active.map((op) => (
                    <button
                      title={t('Cancel operation', 'Cancelar operação')}
                      key={op.id}
                      onClick={() =>
                        run(async () => {
                          await window.builder.operations.cancel(op.id)
                        })
                      }
                    >
                      <Loader2 size={12} className="spin" />
                      {op.channel}
                      <X size={12} />
                    </button>
                  ))}
                  <button
                    className="icon-button"
                    title={t('Follow container logs', 'Acompanhar logs do container')}
                    onClick={() =>
                      run(async () => {
                        const id = await window.builder.runtime.logs(project.id)
                        setActive((v) =>
                          v.some((op) => op.id === id) ? v : [...v, { id, channel: 'logs' }],
                        )
                        setPanel('logs')
                      })
                    }
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title={t('Copy output', 'Copiar saída')}
                    onClick={() =>
                      run(() =>
                        navigator.clipboard.writeText(panel === 'tests' ? testOutput : output),
                      )
                    }
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title={t('Export output', 'Exportar saída')}
                    onClick={() =>
                      run(() => window.builder.exports.log(panel === 'tests' ? testOutput : output))
                    }
                  >
                    <Download size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title={t('Clear output', 'Limpar saída')}
                    onClick={() => (panel === 'tests' ? setTestOutput('') : setOutput(''))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </header>
              <div className="panel-body">
                <div
                  className="panel-pane"
                  style={{ display: panel === 'terminal' ? 'flex' : 'none' }}
                >
                  <InteractiveTerminal key={project.id} project={project} error={showError} />
                </div>
                <div className="panel-pane" style={{ display: panel === 'logs' ? 'flex' : 'none' }}>
                  <OutputTerminal text={output} />
                </div>
                <div
                  className="panel-pane"
                  style={{ display: panel === 'tests' ? 'flex' : 'none' }}
                >
                  <OutputTerminal text={testOutput} />
                </div>
                {panel === 'problems' && (
                  <div className="problems">
                    {diagnostics.length ? (
                      diagnostics.map((d, i) => (
                        <div key={i} className={d.level === 'error' ? 'error-text' : 'yellow-text'}>
                          <AlertCircle size={14} />
                          {d.message}
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        <Check size={14} />
                        {t('No configuration problems.', 'Nenhum problema de configuração.')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
      <footer className="statusbar">
        <div>
          <GitBranch size={12} />
          {project ? branch : 'main'}
          <span className="status-divider" />
          <Container size={13} />
          {state.status}
          <button
            onClick={() => run(refreshState)}
            title={t('Refresh Docker status', 'Atualizar status Docker')}
          >
            <RefreshCw size={11} />
          </button>
        </div>
        <div>
          {busy && <Loader2 size={12} className="spin" />}
          {dirty && <span>● {t('Unsaved', 'Não salvo')}</span>}
          <span>UTF-8</span>
          <span>{settings.locale}</span>
          <span>Dev Containers</span>
          <CircleHelp size={12} />
        </div>
      </footer>
      {library && (
        <TemplateLibrary
          project={project}
          close={() => setLibrary(false)}
          created={(p) => {
            setLibrary(false)
            void opened(p)
          }}
        />
      )}
      {wizard && (
        <Wizard
          openLibrary={openLibrary}
          close={() => setWizard(false)}
          created={(p) => {
            setWizard(false)
            void opened(p)
          }}
        />
      )}
      {saveReview && project && (
        <Modal
          wide
          title={t('Review changes before saving', 'Revisar alterações antes de salvar')}
          close={() => setSaveReview(false)}
        >
          <div className="modal-body">
            <h3>{project.configPath}</h3>
            <Diff original={project.baseline.configText} modified={project.configText} />
            {Object.entries(project.composeFiles ?? {})
              .filter(([file, text]) => text !== project.baseline.composeFiles?.[file])
              .map(([file, text]) => (
                <div key={file}>
                  <h3>{file}</h3>
                  <Diff
                    language="yaml"
                    original={project.baseline.composeFiles?.[file] ?? ''}
                    modified={text}
                  />
                </div>
              ))}
            {project.dockerfile !== project.baseline.dockerfile && (
              <>
                <h3>Dockerfile</h3>
                <Diff
                  language="dockerfile"
                  original={project.baseline.dockerfile}
                  modified={project.dockerfile}
                />
              </>
            )}
            <div className="inline">
              <button className="primary" disabled={busy} onClick={() => run(persist)}>
                <Save size={14} />
                {t('Save reviewed changes', 'Salvar alterações revisadas')}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const p = await window.builder.projects.saveAs(project)
                    if (p) {
                      setSaveReview(false)
                      await opened(p)
                    }
                  })
                }
              >
                {t('Save as…', 'Salvar como…')}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {trust && project && (
        <Modal
          title={t('Run this environment?', 'Executar este ambiente?')}
          close={() => setTrust(undefined)}
        >
          <div className="modal-body">
            <Notice>
              {t(
                'Dockerfile instructions and lifecycle hooks can execute commands. Review the project and host access before continuing.',
                'Instruções do Dockerfile e hooks podem executar comandos. Revise o projeto e os acessos ao host antes de continuar.',
              )}
            </Notice>
            <pre className="code-preview">
              {JSON.stringify(
                {
                  build: c.build,
                  image: c.image,
                  features: c.features,
                  initializeCommand: c.initializeCommand,
                  postCreateCommand: c.postCreateCommand,
                  workspaceMount: c.workspaceMount,
                  mounts: c.mounts,
                  runArgs: c.runArgs,
                },
                null,
                2,
              )}
            </pre>
            <button className="primary" disabled={busy} onClick={() => run(execute)}>
              <Play size={14} />
              {trust === 'test'
                ? t('Build & test', 'Construir e testar')
                : t('Start environment', 'Iniciar ambiente')}
            </button>
            <div className="inline">
              <button
                onClick={() =>
                  run(async () => setStats(await window.builder.runtime.stats(project.id)))
                }
              >
                {t('Inspect managed container', 'Inspecionar container gerenciado')}
              </button>
              <button
                className="danger-button"
                onClick={() => run(() => window.builder.runtime.clean(project.id))}
              >
                {t('Remove managed container', 'Remover container gerenciado')}
              </button>
            </div>
            {stats && <pre className="code-preview">{stats}</pre>}
          </div>
        </Modal>
      )}
    </div>
  )
}
function SearchGlyph() {
  return <span style={{ fontSize: 14 }}>⌕</span>
}
function PlusGlyph() {
  return <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
}
function SettingsEditor({
  opened,
  settings,
  change,
  capabilities,
  setCapabilities,
  run,
}: {
  opened: (p: Project) => void
  settings: Settings
  change: (value: Settings) => void
  capabilities: Capability[]
  setCapabilities: (value: Capability[]) => void
  run: (fn: () => Promise<unknown>) => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(settings)
  const importedThemes = useImportedThemes()
  const [contexts, setContexts] = useState<
    { name: string; endpoint: string; socketPath?: string }[]
  >([])
  return (
    <div className="editor-content">
      <Section
        title={t('Application settings', 'Configurações do aplicativo')}
        description={t(
          'Local preferences are stored outside your projects.',
          'Preferências locais são armazenadas fora dos projetos.',
        )}
      >
        <Field label={t('Language', 'Idioma')}>
          <select
            value={draft.locale}
            onChange={(e) => setDraft({ ...draft, locale: e.target.value as Settings['locale'] })}
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label={t('Color theme', 'Tema visual')}>
          <select
            value={draft.theme}
            onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
          >
            {[...themes, ...importedThemes].map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          onClick={() =>
            run(async () => {
              const values = await window.builder.extensions.import()
              if (values.length) {
                window.dispatchEvent(new Event('dcb-themes'))
                setDraft({ ...draft, theme: values[0].id })
              }
            })
          }
        >
          {t('Import VS Code theme JSON/VSIX', 'Importar tema do VS Code JSON/VSIX')}
        </button>
        <Field label={t('Container engine', 'Motor de containers')}>
          <select
            value={draft.engine}
            onChange={(e) => {
              setDraft({
                ...draft,
                engine: e.target.value as Settings['engine'],
                dockerEndpoint: '',
              })
              setContexts([])
            }}
          >
            <option value="docker">Docker</option>
            <option value="podman">Podman</option>
          </select>
        </Field>
        {draft.engine === 'podman' && (
          <Notice>
            {t(
              'Enable the rootless API socket with systemctl --user start podman.socket on Linux, or start Podman Machine on macOS/Windows. Rootless Features may require additional privileges.',
              'Ative o socket da API com systemctl --user start podman.socket no Linux ou inicie o Podman Machine no macOS/Windows. Features em modo rootless podem exigir privilégios adicionais.',
            )}
          </Notice>
        )}
        <Field
          label={t('Engine endpoint', 'Endpoint do motor')}
          hint={t(
            'Empty discovers the selected engine. Supports unix://, npipe://, ssh://user@host and TCP/TLS endpoints.',
            'Vazio detecta o motor selecionado. Aceita unix://, npipe://, ssh://usuario@host e endpoints TCP/TLS.',
          )}
        >
          <input
            value={draft.dockerEndpoint}
            onChange={(e) => setDraft({ ...draft, dockerEndpoint: e.target.value })}
            placeholder="unix:///var/run/docker.sock"
          />
        </Field>
        <button
          onClick={() =>
            run(async () => setContexts(await window.builder.system.contexts(draft.engine)))
          }
        >
          {t('Discover engine connections', 'Consultar conexões do motor')}
        </button>
        {contexts.map((c) => (
          <button
            key={c.name}

            onClick={() =>
              setDraft({ ...draft, dockerEndpoint: c.endpoint, sshSocketPath: c.socketPath ?? '' })
            }
          >
            {c.name} · {c.endpoint}
          </button>
        ))}
        <Field
          label={t('Compose executable (optional)', 'Executável Compose (opcional)')}
          hint={t(
            'For Podman, install a compatible Compose provider and enter its executable path.',
            'Para Podman, instale um provedor Compose compatível e informe o caminho do executável.',
          )}
        >
          <input
            value={draft.composePath}
            onChange={(e) => setDraft({ ...draft, composePath: e.target.value })}
          />
        </Field>
        <Field
          label={t('TLS certificate directory', 'Diretório de certificados TLS')}
          hint="ca.pem, cert.pem, key.pem"
        >
          <input
            value={draft.tlsCertPath}
            onChange={(e) => setDraft({ ...draft, tlsCertPath: e.target.value })}
          />
        </Field>
        <Field
          label={t('Remote SSH socket path', 'Caminho remoto do socket SSH')}
          hint={t(
            'SSH uses your agent and known_hosts. For rootless Podman, specify /run/user/UID/podman/podman.sock.',
            'SSH usa seu agente e known_hosts. Para Podman rootless, informe /run/user/UID/podman/podman.sock.',
          )}
        >
          <input
            value={draft.sshSocketPath}
            onChange={(e) => setDraft({ ...draft, sshSocketPath: e.target.value })}
          />
        </Field>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.autoUpdate}
            onChange={(e) => setDraft({ ...draft, autoUpdate: e.target.checked })}
          />
          {t(
            'Check for application updates automatically',
            'Verificar atualizações do aplicativo automaticamente',
          )}
        </label>
        <Field label={t('Preferred shell', 'Shell preferido')}>
          <input
            value={draft.shell}
            onChange={(e) => setDraft({ ...draft, shell: e.target.value })}
          />
        </Field>
        <button
          className="primary"
          onClick={() => run(async () => change(await window.builder.settings.save(draft)))}
        >
          <Save size={14} />
          {t('Save settings', 'Salvar configurações')}
        </button>
      </Section>
      <Section title={t('Environment diagnostics', 'Diagnóstico do ambiente')}>
        <button
          onClick={() =>
            run(async () => setCapabilities(await window.builder.system.capabilities()))
          }
        >
          <RefreshCw size={14} />
          {t('Check tools & engine', 'Verificar ferramentas e motor')}
        </button>
        <div className="capabilities">
          {capabilities.map((c) => (
            <div key={c.name}>
              <span className={c.ok ? 'green-text' : 'error-text'}>{c.ok ? '●' : '○'}</span>
              <strong>{c.name}</strong>
              <pre>{c.detail}</pre>
            </div>
          ))}
        </div>
        <button onClick={() => run(() => window.builder.git.login())}>
          {t('Sign in to GitHub', 'Entrar no GitHub')}
        </button>
      </Section>
      <ApplicationTools run={run} opened={opened} />
    </div>
  )
}
