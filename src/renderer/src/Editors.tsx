// SPDX-License-Identifier: MPL-2.0
import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Code2,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  GitBranch,
  Upload,
  RefreshCw,
} from 'lucide-react'
import type { Config, ExportPlan, GitInfo, Project, TestCommand } from '../../shared/types'
import { parseMount, mountString, readConfig, patchConfig } from '../../shared/config'
import {
  appendBlock,
  deleteBlock,
  editBlock,
  moveBlock,
  parseDockerfile,
  instructions,
} from '../../shared/dockerfile'
import { Code, Diff, Field, JsonField, KeyValues, Modal, Notice, Section, useT } from './ui'
import { FeaturePicker, ImagePicker, MountEditor } from './Wizard'

import { helperNames } from '../../shared/helpers'
import {
  AccessAssistant,
  CompareConfiguration,
  ComposeEditor,
  FeatureMaintenance,
  SecurityTools,
  VolumeManager,
} from './Roadmap'

export const tabs = [
  'general',
  'repository',
  'dockerfile',
  'compose',
  'features',
  'environment',
  'mounts',
  'lifecycle',
  'tools',
  'tests',
  'security',
  'source',
  'export',
] as const
export type Tab = (typeof tabs)[number]
export function tabLabel(tab: Tab, t: (en: string, pt: string) => string): string {
  return {
    general: t('Overview', 'Visão geral'),
    repository: t('Repository', 'Repositório'),
    dockerfile: 'Dockerfile',
    compose: 'Compose',
    security: t('Security', 'Segurança'),
    features: 'Features',
    environment: t('Environment', 'Ambiente'),
    mounts: t('Ports & volumes', 'Portas e volumes'),
    lifecycle: t('Lifecycle', 'Ciclo de vida'),
    tools: t('Tools', 'Ferramentas'),
    tests: t('Tests', 'Testes'),
    source: t('Source', 'Código'),
    export: t('Export', 'Distribuição'),
  }[tab]
}
export function DockerfileEditor({
  project,
  change,
}: {
  project: Project
  change: (value: string) => void
}) {
  const t = useT()
  const [mode, setMode] = useState<'visual' | 'source' | 'diff'>('visual')
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState('')
  const [type, setType] = useState('RUN')
  const [content, setContent] = useState('')
  const [withComments, setWithComments] = useState(false)
  const [deleting, setDeleting] = useState<string>()
  const [error, setError] = useState('')
  const doc = parseDockerfile(project.dockerfile)
  function action(fn: () => string) {
    try {
      change(fn())
      setSelected(undefined)
      setError('')
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <Section
      title="Dockerfile"
      description={t(
        'Build steps, documentation and source, together. Existing comments and formatting are preserved.',
        'Etapas de build, documentação e código. Comentários e formatação existentes são preservados.',
      )}
    >
      <div className="segmented">
        {(['visual', 'source', 'diff'] as const).map((value) => (
          <button
            className={mode === value ? 'active' : ''}
            key={value}
            onClick={() => setMode(value)}
          >
            {value === 'visual'
              ? t('Visual', 'Visual')
              : value === 'source'
                ? t('Source', 'Código')
                : t('Changes', 'Alterações')}
          </button>
        ))}
      </div>
      {mode === 'source' ? (
        <Code language="dockerfile" value={project.dockerfile} onChange={change} height="520px" />
      ) : mode === 'diff' ? (
        <Diff
          original={project.baseline.dockerfile}
          modified={project.dockerfile}
          language="dockerfile"
        />
      ) : (
        <>
          {!doc.safe && (
            <Notice>
              {doc.reason}{' '}
              {t(
                'Use the Source tab to edit this file safely.',
                'Use a aba Código para editar este arquivo com segurança.',
              )}
            </Notice>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={withComments}
              onChange={(e) => setWithComments(e.target.checked)}
            />
            {t(
              'Move preceding comments with the instruction',
              'Mover comentários anteriores junto com a instrução',
            )}
          </label>
          <div className="docker-blocks">
            {doc.blocks.map((block) =>
              block.kind === 'blank' ? (
                <div className="blank-line" key={block.id} />
              ) : (
                <div
                  className={`docker-block ${block.kind} ${selected === block.id ? 'editing' : ''}`}
                  key={block.id}
                >
                  <div className="block-glyph">
                    {block.kind === 'comment' ? (
                      <MessageSquare size={14} />
                    ) : block.kind === 'directive' ? (
                      <Code2 size={14} />
                    ) : (
                      <span>{block.instruction ?? '?'}</span>
                    )}
                  </div>
                  <button
                    className="block-content"
                    disabled={!doc.safe || block.kind === 'directive'}
                    onClick={() => {
                      setSelected(block.id)
                      setDraft(block.raw)
                    }}
                  >
                    <pre>{block.raw.trimEnd()}</pre>
                  </button>
                  <div className="block-actions">
                    <button
                      className="icon-button"
                      disabled={!doc.safe || block.kind === 'directive'}
                      title={t('Move up', 'Mover acima')}
                      onClick={() =>
                        action(() => moveBlock(project.dockerfile, block.id, -1, withComments))
                      }
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={!doc.safe || block.kind === 'directive'}
                      title={t('Move down', 'Mover abaixo')}
                      onClick={() =>
                        action(() => moveBlock(project.dockerfile, block.id, 1, withComments))
                      }
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={!doc.safe || block.kind === 'directive'}
                      title={t('Remove', 'Remover')}
                      onClick={() => setDeleting(block.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
          {selected && (
            <div className="block-edit">
              <Field label={t('Edit selected block', 'Editar bloco selecionado')}>
                <textarea
                  className="mono"
                  rows={5}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </Field>
              <button onClick={() => action(() => editBlock(project.dockerfile, selected, draft))}>
                <Save size={14} />
                {t('Apply block', 'Aplicar bloco')}
              </button>
            </div>
          )}
          <div className="add-block">
            <div className="grid-two">
              <Field label={t('New block', 'Novo bloco')}>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="#">{t('Comment', 'Comentário')}</option>
                  {instructions
                    .filter((i) => i !== 'MAINTAINER')
                    .map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                </select>
              </Field>
              <Field label={t('Content', 'Conteúdo')}>
                <textarea
                  className="mono"
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    type === '#'
                      ? t('Explain this step…', 'Explique esta etapa…')
                      : 'apt-get update && apt-get install -y curl'
                  }
                />
              </Field>
            </div>
            <button
              disabled={!doc.safe || !content.trim()}
              onClick={() => {
                action(() =>
                  appendBlock(
                    project.dockerfile,
                    type === '#'
                      ? content
                          .split(/\r?\n/)
                          .map((line) => (line.startsWith('#') ? line : '# ' + line))
                          .join(doc.eol)
                      : `${type} ${content}`,
                  ),
                )
                setContent('')
              }}
            >
              <Plus size={14} />
              {t('Add block', 'Adicionar bloco')}
            </button>
          </div>
        </>
      )}
      {error && <Notice danger>{error}</Notice>}
      {deleting && (
        <Modal title={t('Remove block', 'Remover bloco')} close={() => setDeleting(undefined)}>
          <div className="modal-body">
            <p>
              {t(
                'Keep preceding comments as independent documentation, or remove them together?',
                'Preservar comentários anteriores como documentação independente ou removê-los junto?',
              )}
            </p>
            <div className="inline">
              <button
                onClick={() => {
                  action(() => deleteBlock(project.dockerfile, deleting, false))
                  setDeleting(undefined)
                }}
              >
                {t('Keep comments', 'Preservar comentários')}
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  action(() => deleteBlock(project.dockerfile, deleting, true))
                  setDeleting(undefined)
                }}
              >
                {t('Remove with comments', 'Remover com comentários')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  )
}
function Repository({
  project,
  run,
}: {
  project: Project
  run: (fn: () => Promise<unknown>) => void
}) {
  const t = useT()
  const [info, setInfo] = useState<GitInfo>()
  const [owner, setOwner] = useState('')
  const [name, setName] = useState('')
  const [privateRepo, setPrivate] = useState(true)
  const [message, setMessage] = useState('chore: add dev container')
  const [selected, setSelected] = useState<string[]>(
    project.files.filter(
      (f) => f.startsWith('.devcontainer/') || f === '.devcontainer.json' || f === '.dockerignore',
    ),
  )
  const [review, setReview] = useState(false)
  const refresh = async () => setInfo(await window.builder.git.info(project.id))
  return (
    <>
      <Section
        title={t('Project repository', 'Repositório do projeto')}
        description={t(
          'Code stays on your host and is mounted into the development container.',
          'O código fica no host e é montado no container de desenvolvimento.',
        )}
      >
        <div className="inline">
          <button onClick={() => run(refresh)}>
            <RefreshCw size={14} />
            {t('Refresh status', 'Atualizar status')}
          </button>
          <button
            onClick={() =>
              run(async () => {
                await window.builder.git.login()
                await refresh()
              })
            }
          >
            {t('Sign in with GitHub CLI', 'Entrar com GitHub CLI')}
          </button>
        </div>
        {info && (
          <>
            <div className="info-grid">
              <span>{t('Branch', 'Branch')}</span>
              <code>{info.branch || '—'}</code>
              <span>GitHub</span>
              <code>{info.account || '—'}</code>
            </div>
            <pre className="code-preview">
              {info.remotes || t('No remotes', 'Sem remotos')}
              <br />
              {info.status || t('Working tree clean', 'Pasta de trabalho limpa')}
            </pre>
          </>
        )}
      </Section>
      <Section title={t('Create GitHub remote', 'Criar remoto no GitHub')}>
        <div className="grid-two">
          <Field label={t('Owner / organization (optional)', 'Conta / organização (opcional)')}>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </Field>
          <Field label={t('Repository name', 'Nome do repositório')}>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={privateRepo}
            onChange={(e) => setPrivate(e.target.checked)}
          />
          {t('Private', 'Privado')}
        </label>
        <button
          disabled={!name}
          onClick={() =>
            run(async () => {
              await window.builder.git.createRemote(project.id, owner, name, privateRepo)
              await refresh()
            })
          }
        >
          <GitBranch size={14} />
          {t('Create and link origin', 'Criar e vincular origin')}
        </button>
      </Section>
      <Section title={t('Helper scripts', 'Scripts auxiliares')}>
        <button
          onClick={() =>
            run(async () => {
              await window.builder.projects.scripts(project.id)
              await refresh()
            })
          }
        >
          {t(
            'Create missing start/stop/shell scripts',
            'Criar scripts de start/stop/shell ausentes',
          )}
        </button>
        <p className="muted">
          {t(
            'Scripts are placed at the project root. Existing files are preserved.',
            'Scripts ficam na raiz do projeto. Arquivos existentes são preservados.',
          )}
        </p>
      </Section>
      <Section title={t('Commit & push', 'Commit e push')}>
        <Field label={t('Commit message', 'Mensagem do commit')}>
          <input value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <button onClick={() => setReview(!review)}>
          {t('Review selected files', 'Revisar arquivos selecionados')} ({selected.length})
        </button>
        {review && (
          <div className="file-checks">
            {project.files.map((file) => (
              <label className="checkbox" key={file}>
                <input
                  type="checkbox"
                  checked={selected.includes(file)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, file] : selected.filter((f) => f !== file),
                    )
                  }
                />
                <code>{file}</code>
              </label>
            ))}
          </div>
        )}
        <div className="inline">
          <button
            disabled={!selected.length || !message.trim()}
            onClick={() =>
              run(async () => {
                await window.builder.git.commit(project.id, message, selected)
                await refresh()
              })
            }
          >
            {t('Commit selected files', 'Commit dos arquivos selecionados')}
          </button>
          <button
            onClick={() =>
              run(async () => {
                if (
                  window.confirm(
                    t('Push the current branch to origin?', 'Enviar a branch atual para origin?'),
                  )
                ) {
                  await window.builder.git.push(project.id)
                  await refresh()
                }
              })
            }
          >
            <Upload size={14} />
            Push
          </button>
        </div>
        <small className="muted">
          {t(
            'Existing identity, remotes and history are preserved. Git must have a configured author.',
            'Identidade, remotos e histórico são preservados. Configure o autor no Git.',
          )}
        </small>
      </Section>
    </>
  )
}
function ExportEditor({
  project,
  run,
}: {
  project: Project
  run: (fn: () => Promise<unknown>) => void
}) {
  const t = useT()
  const [plan, setPlan] = useState<ExportPlan>()
  const [selected, setSelected] = useState<string[]>([])
  const [ack, setAck] = useState(false)
  const [result, setResult] = useState('')
  return (
    <Section
      title={t('Portable export', 'Exportação portátil')}
      description={t(
        'Choose the files that travel with your environment. Git history, credentials and volume contents are excluded.',
        'Selecione os arquivos que acompanham o ambiente. Histórico Git, credenciais e conteúdo de volumes são excluídos.',
      )}
    >
      <button
        onClick={() =>
          run(async () => {
            const p = await window.builder.exports.plan(project.id)
            setPlan(p)
            setSelected(
              p.entries
                .filter(
                  (e) =>
                    e.path.startsWith('.devcontainer/') ||
                    e.path === '.devcontainer.json' ||
                    e.path === '.dockerignore' ||
                    helperNames.includes(e.path) ||
                    Object.keys(project.composeFiles ?? {}).includes(e.path),
                )
                .map((e) => e.path),
            )
            setAck(false)
          })
        }
      >
        <RefreshCw size={14} />
        {t('Analyze saved project', 'Analisar projeto salvo')}
      </button>
      {plan && (
        <>
          <div className="inline">
            <button onClick={() => setSelected(plan.entries.map((e) => e.path))}>
              {t('Select all allowed files', 'Selecionar todos os arquivos permitidos')}
            </button>
            <button
              onClick={() =>
                setSelected([
                  project.configPath,
                  ...(project.dockerfilePath ? [project.dockerfilePath] : []),
                  ...Object.keys(project.composeFiles ?? {}),
                ])
              }
            >
              {t('Configuration only', 'Somente configuração')}
            </button>
            <span className="muted">
              {selected.length} / {plan.entries.length}
            </span>
          </div>
          <div className="file-checks">
            {plan.entries.map((entry) => (
              <label className="checkbox" key={entry.path}>
                <input
                  type="checkbox"
                  checked={selected.includes(entry.path)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, entry.path]
                        : selected.filter((f) => f !== entry.path),
                    )
                  }
                />
                <code>{entry.path}</code>
                <small className="muted">{(entry.size / 1024).toFixed(1)} KB</small>
              </label>
            ))}
          </div>
          {plan.dependencies.length > 0 && (
            <>
              <Notice>
                <strong>{t('Dependencies to review', 'Dependências a revisar')}</strong>
                <ul>
                  {plan.dependencies.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </Notice>
              <label className="checkbox">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                {t(
                  'I reviewed dependencies and selected the required files. Local mounts may require remapping.',
                  'Revisei as dependências e selecionei os arquivos necessários. Montagens locais podem precisar de remapeamento.',
                )}
              </label>
            </>
          )}
          <button
            className="primary"
            disabled={
              !selected.includes(project.configPath) || (plan.dependencies.length > 0 && !ack)
            }
            onClick={() =>
              run(async () => {
                const file = await window.builder.exports.zip(project.id, selected)
                if (file) setResult(file)
              })
            }
          >
            {t('Export ZIP', 'Exportar ZIP')}
          </button>
          {result && (
            <Notice>
              {t('Exported to', 'Exportado para')}: {result}
            </Notice>
          )}
        </>
      )}
    </Section>
  )
}
function TestEditor({
  project,
  update,
  run,
}: {
  project: Project
  update: (project: Project) => void
  run: (fn: () => Promise<unknown>) => void
}) {
  const t = useT()
  const tests = project.auxiliary.tests
  const change = (value: TestCommand[]) =>
    update({ ...project, auxiliary: { ...project.auxiliary, tests: value } })
  const patch = (id: string, value: Partial<TestCommand>) =>
    change(tests.map((test) => (test.id === id ? { ...test, ...value } : test)))
  return (
    <Section
      title={t('Environment checks', 'Verificações do ambiente')}
      description={t(
        'Validate, build, start and inspect; then run these commands in order. The first failure stops the sequence.',
        'Validar, construir, iniciar e inspecionar; depois executar estes comandos em ordem. A primeira falha interrompe a sequência.',
      )}
    >
      {tests.map((test) => (
        <div className="mount-card" key={test.id}>
          <div className="grid-two">
            <Field label={t('Name', 'Nome')}>
              <input value={test.name} onChange={(e) => patch(test.id, { name: e.target.value })} />
            </Field>
            <Field label={t('Working directory (optional)', 'Diretório de trabalho (opcional)')}>
              <input
                value={test.cwd ?? ''}
                onChange={(e) => patch(test.id, { cwd: e.target.value || undefined })}
              />
            </Field>
          </div>
          <Field label={t('Shell command', 'Comando shell')}>
            <textarea
              className="mono"
              value={test.command}
              onChange={(e) => patch(test.id, { command: e.target.value })}
            />
          </Field>
          <div className="grid-two">
            <Field label={t('Timeout (milliseconds)', 'Timeout (milissegundos)')}>
              <input
                type="number"
                min="100"
                max="3600000"
                value={test.timeout}
                onChange={(e) => patch(test.id, { timeout: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('Expected exit code', 'Código de saída esperado')}>
              <input
                type="number"
                min="0"
                max="255"
                value={test.expectedCode}
                onChange={(e) => patch(test.id, { expectedCode: Number(e.target.value) })}
              />
            </Field>
          </div>
          <button onClick={() => change(tests.filter((item) => item.id !== test.id))}>
            <Trash2 size={14} />
            {t('Remove', 'Remover')}
          </button>
        </div>
      ))}
      <div className="inline">
        <button
          onClick={() =>
            change([
              ...tests,
              {
                id: crypto.randomUUID(),
                name: t('New check', 'Nova verificação'),
                command: 'uname -a',
                timeout: 30000,
                expectedCode: 0,
              },
            ])
          }
        >
          <Plus size={14} />
          {t('Add check', 'Adicionar verificação')}
        </button>
        <button onClick={() => run(() => window.builder.runtime.report(project.id))}>
          {t('Export last report', 'Exportar último relatório')}
        </button>
      </div>
    </Section>
  )
}
export function Editors({
  tab,
  project,
  update,
  patch,
  run,
}: {
  tab: Tab
  project: Project
  update: (project: Project) => void
  patch: (path: (string | number)[], value: unknown) => void
  run: (fn: () => Promise<unknown>) => void
}) {
  const t = useT()
  const { config: c, errors } = readConfig(project.configText)
  if (tab === 'compose') return <ComposeEditor project={project} update={update} />
  if (tab === 'security') return <SecurityTools project={project} run={run} />
  if (tab === 'dockerfile')
    return (
      <DockerfileEditor
        project={project}
        change={(dockerfile) => update({ ...project, dockerfile })}
      />
    )
  if (tab === 'source')
    return (
      <Section
        title="devcontainer.json"
        description={t(
          'JSON with comments. Unknown properties are retained.',
          'JSON com comentários. Propriedades desconhecidas são preservadas.',
        )}
      >
        <CompareConfiguration project={project} run={run} />
        <Code
          value={project.configText}
          language="json"
          onChange={(configText) => update({ ...project, configText })}
          height="550px"
        />
      </Section>
    )
  if (tab === 'repository') return <Repository project={project} run={run} />
  if (tab === 'tests') return <TestEditor project={project} update={update} run={run} />
  if (tab === 'export') return <ExportEditor project={project} run={run} />
  if (errors.length)
    return (
      <Notice danger>
        {t(
          'Fix JSONC syntax in Source before using visual controls.',
          'Corrija a sintaxe JSONC na aba Código antes de usar os controles visuais.',
        )}
      </Notice>
    )
  const obj = (value: unknown): Config =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Config) : {}
  if (tab === 'general')
    return (
      <>
        <Section
          title={t('Environment overview', 'Visão geral do ambiente')}
          description={t(
            'Your environment, described as code.',
            'Seu ambiente, descrito como código.',
          )}
        >
          <div className="grid-two">
            <Field label={t('Name', 'Nome')}>
              <input
                value={String(c.name ?? '')}
                onChange={(e) => patch(['name'], e.target.value)}
              />
            </Field>
            <Field label={t('Remote user', 'Usuário remoto')}>
              <input
                value={String(c.remoteUser ?? '')}
                onChange={(e) => patch(['remoteUser'], e.target.value || undefined)}
              />
            </Field>
          </div>
          <Field label={t('Workspace inside container', 'Workspace no container')}>
            <input
              value={String(c.workspaceFolder ?? '')}
              onChange={(e) => patch(['workspaceFolder'], e.target.value)}
            />
          </Field>
          <div className="info-grid">
            <span>{t('Project folder', 'Pasta do projeto')}</span>
            <code>{project.root}</code>
            <span>{t('Configuration', 'Configuração')}</span>
            <code>{project.configPath}</code>
            <span>{t('Build mode', 'Modo de build')}</span>
            <code>{c.dockerComposeFile ? 'Compose' : c.image ? 'image' : 'Dockerfile'}</code>
          </div>
        </Section>
        {c.dockerComposeFile ? (
          <Notice>
            {t('Edit services in the Compose tab.', 'Edite os serviços na aba Compose.')}
          </Notice>
        ) : typeof c.image === 'string' ? (
          <Section title={t('Container image', 'Imagem do container')}>
            <ImagePicker value={c.image} change={(image) => patch(['image'], image)} />
            <button
              onClick={() => {
                let configText = patchConfig(project.configText, ['image'], undefined)
                configText = patchConfig(configText, ['build'], {
                  dockerfile: 'Dockerfile',
                  compose: 'Compose',
                  security: t('Security', 'Segurança'),
                  context: '..',
                })
                update({
                  ...project,
                  configText,
                  dockerfile: project.dockerfile || `# Development image\nFROM ${c.image}\n`,
                })
              }}
            >
              {t('Use a Dockerfile', 'Usar um Dockerfile')}
            </button>
          </Section>
        ) : (
          <Section title={t('Build configuration', 'Configuração do build')}>
            <JsonField
              label="build"
              value={c.build ?? { dockerfile: c.dockerFile, context: '.' }}
              apply={(value) => patch(['build'], value)}
            />
          </Section>
        )}
      </>
    )
  if (tab === 'features')
    return (
      <>
        <Section
          title="Features"
          description={t(
            'Reusable development tools installed by the Dev Containers CLI.',
            'Ferramentas reutilizáveis instaladas pela CLI de Dev Containers.',
          )}
        >
          <FeaturePicker value={obj(c.features)} change={(value) => patch(['features'], value)} />
          <FeatureMaintenance project={project} update={update} run={run} />
        </Section>
        {Object.entries(obj(c.features)).map(([key, value]) => (
          <Section key={key} title={key}>
            <JsonField
              label={t('Feature options', 'Opções da Feature')}
              value={value}
              apply={(value) => patch(['features', key], value)}
            />
            <button onClick={() => patch(['features', key], undefined)}>
              {t('Remove Feature', 'Remover Feature')}
            </button>
          </Section>
        ))}
      </>
    )
  if (tab === 'environment')
    return (
      <>
        <AccessAssistant project={project} update={update} />
        <Section title={t('Environment variables', 'Variáveis de ambiente')}>
          <KeyValues
            label="containerEnv"
            value={obj(c.containerEnv)}
            apply={(value) => patch(['containerEnv'], value)}
          />
          <KeyValues
            label="remoteEnv"
            value={obj(c.remoteEnv)}
            apply={(value) => patch(['remoteEnv'], value)}
          />
          <Notice>
            {t(
              'Use variable references for secrets. Values stored here are part of your project and export.',
              'Use referências de variáveis para secrets. Valores gravados aqui fazem parte do projeto e da exportação.',
            )}
          </Notice>
        </Section>
        <Section title={t('Build arguments', 'Argumentos de build')}>
          <JsonField
            label="build.args"
            value={obj(c.build).args ?? {}}
            apply={(value) => patch(['build', 'args'], value)}
          />
        </Section>
      </>
    )
  if (tab === 'mounts') {
    const mounts = Array.isArray(c.mounts) ? c.mounts : []
    const simple = mounts.map(parseMount)
    const allSimple = simple.every((m) => m !== null)
    return (
      <>
        <Section title={t('Workspace mount', 'Montagem do workspace')}>
          <Field label="workspaceMount">
            <input
              value={String(c.workspaceMount ?? '')}
              onChange={(e) => patch(['workspaceMount'], e.target.value || undefined)}
            />
          </Field>
          <button
            onClick={() =>
              patch(
                ['workspaceMount'],
                'type=bind,source=${localWorkspaceFolder},target=' +
                  String(c.workspaceFolder ?? '/workspace'),
              )
            }
          >
            {t('Mount project folder as workspace', 'Montar pasta do projeto como workspace')}
          </button>
        </Section>
        <Section
          title={t('Additional folders & volumes', 'Pastas e volumes adicionais')}
          description={t(
            'Removing a mount never deletes its data. Paths refer to the Docker host.',
            'Remover uma montagem não apaga seus dados. Os caminhos se referem ao host Docker.',
          )}
        >
          {allSimple ? (
            <MountEditor
              mounts={simple.filter((m): m is NonNullable<typeof m> => m !== null)}
              change={(value) => {
                try {
                  patch(['mounts'], value.map(mountString))
                } catch {
                  patch(['mounts'], value)
                }
              }}
            />
          ) : (
            <JsonField label="mounts" value={mounts} apply={(value) => patch(['mounts'], value)} />
          )}
        </Section>
        <VolumeManager project={project} update={update} run={run} />
        <Section title={t('Ports', 'Portas')}>
          <JsonField
            label="forwardPorts"
            value={c.forwardPorts ?? []}
            apply={(value) => patch(['forwardPorts'], value)}
          />
          <Notice>
            {t(
              'forwardPorts is metadata for supporting IDEs. For local access during tests, publish a host port using runArgs, for example ["-p", "127.0.0.1:3000:3000"].',
              'forwardPorts é metadado para IDEs. Para acesso local durante testes, publique uma porta em runArgs, por exemplo ["-p", "127.0.0.1:3000:3000"].',
            )}
          </Notice>
          <JsonField
            label="runArgs"
            value={c.runArgs ?? []}
            apply={(value) => patch(['runArgs'], value)}
          />
        </Section>
      </>
    )
  }
  if (tab === 'lifecycle')
    return (
      <Section
        title={t('Lifecycle commands', 'Comandos do ciclo de vida')}
        description={t(
          'initializeCommand runs on the host. Other hooks run in the container. Nothing executes on open or save.',
          'initializeCommand executa no host. Os demais hooks executam no container. Nada executa ao abrir ou salvar.',
        )}
      >
        {[
          'initializeCommand',
          'onCreateCommand',
          'updateContentCommand',
          'postCreateCommand',
          'postStartCommand',
          'postAttachCommand',
        ].map((key) =>
          typeof c[key] === 'object' ? (
            <JsonField
              key={key}
              label={key}
              value={c[key]}
              apply={(value) => patch([key], value)}
            />
          ) : (
            <Field key={key} label={key}>
              <textarea
                className="mono"
                rows={2}
                value={String(c[key] ?? '')}
                onChange={(e) => patch([key], e.target.value || undefined)}
              />
            </Field>
          ),
        )}
      </Section>
    )
  if (tab === 'tools')
    return (
      <Section title={t('VS Code customization', 'Personalização do VS Code')}>
        <JsonField
          label="customizations.vscode.extensions"
          value={obj(obj(c.customizations).vscode).extensions ?? []}
          apply={(value) => patch(['customizations', 'vscode', 'extensions'], value)}
        />
        <JsonField
          label="customizations.vscode.settings"
          value={obj(obj(c.customizations).vscode).settings ?? {}}
          apply={(value) => patch(['customizations', 'vscode', 'settings'], value)}
        />
      </Section>
    )
  return null
}
