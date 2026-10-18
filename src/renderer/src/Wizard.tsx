// SPDX-License-Identifier: MPL-2.0
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FolderOpen, Search, Star, Container } from 'lucide-react'
import { createConfig, features, templates, wizardDefaults } from '../../shared/config'
import type { ImagePage, Mount, Project, WizardData } from '../../shared/types'
import { Field, KeyValues, Modal, Notice, useT } from './ui'

export function ImagePicker({ value, change }: { value: string; change: (value: string) => void }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ImagePage>()
  const [tags, setTags] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [tagPage, setTagPage] = useState(1)
  const [moreTags, setMoreTags] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function search(page = 1) {
    setBusy(true)
    try {
      setResult(await window.builder.images.search(query, page))
      setError('')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  async function select(name: string, page = 1) {
    setSelected(name)
    change(name + ':latest')
    setBusy(true)
    try {
      const r = await window.builder.images.tags(name, page)
      setTags(r.tags)
      setTagPage(page)
      setMoreTags(r.hasNext)
      setError('')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <Field
        label={t('Image reference', 'Referência da imagem')}
        hint={t(
          'Docker Hub, MCR, GHCR or any image reference.',
          'Docker Hub, MCR, GHCR ou outra referência de imagem.',
        )}
      >
        <input value={value} onChange={(e) => change(e.target.value)} placeholder="ubuntu:24.04" />
      </Field>
      <div className="search-row">
        <Search size={16} />
        <input
          aria-label={t('Search Docker Hub', 'Pesquisar no Docker Hub')}
          placeholder={t('Search Docker Hub…', 'Pesquisar no Docker Hub…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search()
          }}
        />
        <button disabled={busy} onClick={() => void search()}>
          {busy ? '…' : t('Search', 'Pesquisar')}
        </button>
      </div>
      {error && <Notice danger>{error}</Notice>}
      {result && (
        <div className="image-results">
          {result.results.map((image) => (
            <button
              className="image-result"
              key={image.name}
              onClick={() => void select(image.name)}
            >
              <Container size={18} />
              <span>
                <strong>{image.name}</strong>
                <small>{image.description}</small>
              </span>
              <small>
                <Star size={11} />
                {image.stars}
              </small>
            </button>
          ))}
          <div className="inline">
            <button
              disabled={result.page <= 1 || busy}
              onClick={() => void search(result.page - 1)}
            >
              ←
            </button>
            <span>{result.page}</span>
            <button disabled={!result.hasNext || busy} onClick={() => void search(result.page + 1)}>
              →
            </button>
          </div>
        </div>
      )}
      {tags.length > 0 && (
        <Field label={`${selected} · tags`}>
          <select
            aria-label="Tag"
            value={value.split(':').at(-1)}
            onChange={(e) => change(selected + ':' + e.target.value)}
          >
            {tags.map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
          <div className="inline">
            <button
              disabled={tagPage === 1 || busy}
              onClick={() => void select(selected, tagPage - 1)}
            >
              ←
            </button>
            <span>{tagPage}</span>
            <button disabled={!moreTags || busy} onClick={() => void select(selected, tagPage + 1)}>
              →
            </button>
          </div>
        </Field>
      )}
    </div>
  )
}
export function MountEditor({
  mounts,
  change,
}: {
  mounts: Mount[]
  change: (mounts: Mount[]) => void
}) {
  const t = useT()
  const [volumes, setVolumes] = useState<string[]>([])
  const [error, setError] = useState('')
  const patch = (index: number, value: Partial<Mount>) =>
    change(mounts.map((m, i) => (i === index ? { ...m, ...value } : m)))
  return (
    <div className="mount-editor">
      {mounts.map((m, i) => (
        <div className="mount-card" key={i}>
          <div className="grid-two">
            <Field label={t('Type', 'Tipo')}>
              <select
                value={m.type}
                onChange={(e) => patch(i, { type: e.target.value as Mount['type'] })}
              >
                <option value="bind">{t('Host folder', 'Pasta do host')}</option>
                <option value="volume">{t('Docker volume', 'Volume Docker')}</option>
              </select>
            </Field>
            <Field label={t('Container destination', 'Destino no container')}>
              <input
                value={m.target}
                onChange={(e) => patch(i, { target: e.target.value })}
                placeholder="/data"
              />
            </Field>
          </div>
          <Field label={t('Source', 'Origem')}>
            <div className="input-action">
              <input
                list={m.type === 'volume' ? 'docker-volumes' : undefined}
                value={m.source}
                onChange={(e) => patch(i, { source: e.target.value })}
              />
              {m.type === 'bind' ? (
                <button
                  title={t('Choose folder', 'Selecionar pasta')}
                  onClick={async () => {
                    const folder = await window.builder.projects.pickDirectory()
                    if (folder) patch(i, { source: folder })
                  }}
                >
                  <FolderOpen size={15} />
                </button>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      try {
                        setVolumes(await window.builder.docker.volumes())
                        setError('')
                      } catch (e) {
                        setError(String(e))
                      }
                    }}
                  >
                    {t('List', 'Listar')}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const volume = await window.builder.docker.createVolume(m.source)
                        patch(i, { source: volume })
                        setError('')
                      } catch (e) {
                        setError(String(e))
                      }
                    }}
                  >
                    {t('Create', 'Criar')}
                  </button>
                </>
              )}
            </div>
          </Field>
          <div className="between">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={m.readOnly}
                onChange={(e) => patch(i, { readOnly: e.target.checked })}
              />
              {t('Read only', 'Somente leitura')}
            </label>
            <button onClick={() => change(mounts.filter((_, index) => index !== i))}>
              {t('Remove', 'Remover')}
            </button>
          </div>
        </div>
      ))}
      <datalist id="docker-volumes">
        {volumes.map((v) => (
          <option value={v} key={v} />
        ))}
      </datalist>
      <button
        onClick={() =>
          change([...mounts, { type: 'bind', source: '', target: '/data', readOnly: false }])
        }
      >
        + {t('Add mount', 'Adicionar montagem')}
      </button>
      {error && <Notice danger>{error}</Notice>}
    </div>
  )
}
export function FeaturePicker({
  value,
  change,
}: {
  value: Record<string, unknown>
  change: (value: Record<string, unknown>) => void
}) {
  const t = useT()
  const [custom, setCustom] = useState('')
  return (
    <div>
      <div className="feature-grid">
        {features.map((feature) => (
          <label
            className={`feature-card ${feature.id in value ? 'selected' : ''}`}
            key={feature.id}
          >
            <input
              type="checkbox"
              checked={feature.id in value}
              onChange={(e) => {
                const next = { ...value }
                if (e.target.checked) next[feature.id] = feature.options
                else delete next[feature.id]
                change(next)
              }}
            />
            <span>
              <strong>{feature.name}</strong>
              <small>{feature.id}</small>
            </span>
          </label>
        ))}
      </div>
      {Object.keys(value).some((k) => k.includes('docker-outside-of-docker')) && (
        <Notice>
          {t(
            'Docker socket access allows the container to control the host Docker daemon. Enable only for trusted projects.',
            'O acesso ao socket permite controlar o Docker do host. Habilite apenas para projetos confiáveis.',
          )}
        </Notice>
      )}
      <div className="input-action">
        <input
          placeholder="ghcr.io/owner/features/name:1"
          aria-label={t('Custom Feature', 'Feature personalizada')}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button
          disabled={!custom.trim()}
          onClick={() => {
            change({ ...value, [custom.trim()]: {} })
            setCustom('')
          }}
        >
          {t('Add', 'Adicionar')}
        </button>
      </div>
    </div>
  )
}
export function Wizard({
  close,
  created,
}: {
  close: () => void
  created: (project: Project) => void
}) {
  const t = useT()
  const [data, setData] = useState<WizardData>(wizardDefaults)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [operationId, setOperationId] = useState<string>()
  useEffect(
    () =>
      window.builder.onEvent((event) => {
        if (event.channel === 'git') setOperationId(event.kind === 'output' ? event.id : undefined)
      }),
    [],
  )
  const steps = [
    t('Project', 'Projeto'),
    t('Repository', 'Repositório'),
    t('Base image', 'Imagem base'),
    t('Features', 'Features'),
    t('Workspace', 'Workspace'),
    t('Environment', 'Ambiente'),
    t('Lifecycle', 'Ciclo de vida'),
    t('Review', 'Revisão'),
  ]
  const patch = (value: Partial<WizardData>) => setData((previous) => ({ ...previous, ...value }))
  function valid(): boolean {
    if (step === 0 && (!data.name.trim() || !data.root))
      throw new Error(
        t(
          'Choose a name and destination folder.',
          'Informe o nome e selecione a pasta de destino.',
        ),
      )
    if (step === 1 && data.repository === 'clone' && !data.repositoryUrl.trim())
      throw new Error(t('Enter a repository URL.', 'Informe a URL do repositório.'))
    if (step === 1 && data.repository === 'github' && !data.githubName.trim())
      throw new Error(
        t('Enter the GitHub repository name.', 'Informe o nome do repositório no GitHub.'),
      )
    if (step === 2 && !/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/.test(data.image))
      throw new Error(
        t('Enter a valid image reference.', 'Informe uma referência de imagem válida.'),
      )
    if (
      step === 4 &&
      (!data.workspaceFolder.startsWith('/') ||
        data.mounts.some((m) => !m.source || !m.target.startsWith('/')))
    )
      throw new Error(
        t('Check workspace and mount paths.', 'Confira os caminhos do workspace e das montagens.'),
      )
    return true
  }
  async function finish() {
    setBusy(true)
    setError('')
    try {
      const project = await window.builder.projects.create(data)
      created(project)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      wide
      title={t('New dev container', 'Novo dev container')}
      close={() => {
        if (!busy) close()
      }}
    >
      <div className="wizard">
        <aside className="wizard-steps">
          <span className="eyebrow">GET STARTED</span>
          {steps.map((label, index) => (
            <div
              className={`wizard-step ${index === step ? 'current' : ''} ${index < step ? 'complete' : ''}`}
              key={label}
            >
              <span>{index < step ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span>
              {label}
            </div>
          ))}
          <p>
            {t(
              'Start with the essentials. Fine-tune everything in the workbench.',
              'Comece pelo essencial. Ajuste cada detalhe no editor principal.',
            )}
          </p>
        </aside>
        <div className="wizard-main">
          <div className="wizard-content">
            <span className="eyebrow">
              {t('STEP', 'ETAPA')} {step + 1} / 8
            </span>
            <h1>{steps[step]}</h1>
            {step === 0 && (
              <>
                <p className="muted">
                  {t(
                    'A reproducible environment starts here.',
                    'Seu ambiente reproduzível começa aqui.',
                  )}
                </p>
                <Field label={t('Project name', 'Nome do projeto')}>
                  <input
                    autoFocus
                    value={data.name}
                    onChange={(e) =>
                      patch({
                        name: e.target.value,
                        workspaceFolder:
                          '/workspaces/' + e.target.value.replace(/[^a-zA-Z0-9_-]/g, '-'),
                      })
                    }
                  />
                </Field>
                <Field label={t('Destination folder', 'Pasta de destino')}>
                  <div className="input-action">
                    <input
                      readOnly
                      value={data.root}
                      placeholder={t('Choose a local folder', 'Selecione uma pasta local')}
                    />
                    <button
                      onClick={async () => {
                        const root = await window.builder.projects.pickDirectory()
                        if (root) patch({ root })
                      }}
                    >
                      <FolderOpen size={16} />
                      {t('Browse', 'Selecionar')}
                    </button>
                  </div>
                </Field>
                <Field label={t('Starter template', 'Modelo inicial')}>
                  <select
                    value={data.template}
                    onChange={(e) => {
                      const template = e.target.value as WizardData['template']
                      patch({ template, ...templates[template] })
                    }}
                  >
                    <option value="empty">{t('Base / empty', 'Base / vazio')}</option>
                    <option value="node">Node.js</option>
                    <option value="python">Python</option>
                    <option value="ubuntu">Ubuntu</option>
                  </select>
                </Field>
              </>
            )}
            {step === 1 && (
              <>
                <Field label={t('Repository source', 'Origem do repositório')}>
                  <select
                    value={data.repository}
                    onChange={(e) =>
                      patch({ repository: e.target.value as WizardData['repository'] })
                    }
                  >
                    <option value="local">
                      {t('Create local Git repository', 'Criar repositório Git local')}
                    </option>
                    <option value="existing">
                      {t(
                        'Use existing local Git repository',
                        'Usar repositório Git local existente',
                      )}
                    </option>
                    <option value="github">
                      {t('Create private/public GitHub repository', 'Criar repositório no GitHub')}
                    </option>
                    <option value="clone">{t('Clone from GitHub', 'Clonar do GitHub')}</option>
                    <option value="none">{t('Folder without Git', 'Pasta sem Git')}</option>
                  </select>
                </Field>
                {data.repository === 'clone' && (
                  <Field label={t('Repository URL or owner/repo', 'URL ou owner/repo')}>
                    <input
                      value={data.repositoryUrl}
                      onChange={(e) => patch({ repositoryUrl: e.target.value })}
                    />
                  </Field>
                )}
                {data.repository !== 'none' && data.repository !== 'existing' && (
                  <Field
                    label={t(
                      'Branch (leave empty to use remote default when cloning)',
                      'Branch (vazio usa a padrão do remoto ao clonar)',
                    )}
                  >
                    <input
                      value={data.branch}
                      onChange={(e) => patch({ branch: e.target.value })}
                    />
                  </Field>
                )}
                {data.repository === 'github' && (
                  <>
                    <div className="grid-two">
                      <Field
                        label={t(
                          'Owner / organization (optional)',
                          'Conta / organização (opcional)',
                        )}
                      >
                        <input
                          value={data.githubOwner}
                          onChange={(e) => patch({ githubOwner: e.target.value })}
                        />
                      </Field>
                      <Field label={t('Repository name', 'Nome do repositório')}>
                        <input
                          value={data.githubName}
                          onChange={(e) => patch({ githubName: e.target.value })}
                        />
                      </Field>
                    </div>
                    <Field label={t('Description', 'Descrição')}>
                      <input
                        value={data.description}
                        onChange={(e) => patch({ description: e.target.value })}
                      />
                    </Field>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={data.githubPrivate}
                        onChange={(e) => patch({ githubPrivate: e.target.checked })}
                      />
                      {t('Private repository', 'Repositório privado')}
                    </label>
                  </>
                )}
                <Notice>
                  {t(
                    'Git and GitHub CLI must be installed. Repository files stay on the host and are mounted in the container. No initial commit or push is automatic.',
                    'Git e GitHub CLI devem estar instalados. Os arquivos ficam no host, montados no container. Commit inicial e push não são automáticos.',
                  )}
                </Notice>
              </>
            )}
            {step === 2 && (
              <>
                <Field label={t('Build strategy', 'Estratégia de build')}>
                  <select
                    value={data.base}
                    onChange={(e) => patch({ base: e.target.value as WizardData['base'] })}
                  >
                    <option value="dockerfile">Dockerfile</option>
                    <option value="image">{t('Ready-made image', 'Imagem pronta')}</option>
                  </select>
                </Field>
                <ImagePicker value={data.image} change={(image) => patch({ image })} />
              </>
            )}
            {step === 3 && (
              <FeaturePicker value={data.features} change={(features) => patch({ features })} />
            )}
            {step === 4 && (
              <>
                <Field label={t('Workspace in container', 'Workspace no container')}>
                  <input
                    value={data.workspaceFolder}
                    onChange={(e) => patch({ workspaceFolder: e.target.value })}
                  />
                </Field>
                <Notice>
                  {t(
                    'Your local project folder will be mounted here with read/write access. Additional mounts are configured below.',
                    'Sua pasta local será montada aqui com leitura/escrita. Configure outras montagens abaixo.',
                  )}
                </Notice>
                <MountEditor mounts={data.mounts} change={(mounts) => patch({ mounts })} />
              </>
            )}
            {step === 5 && (
              <>
                <Field label={t('Remote user', 'Usuário remoto')}>
                  <input
                    value={data.remoteUser}
                    onChange={(e) => patch({ remoteUser: e.target.value })}
                  />
                </Field>
                <Field
                  label={t(
                    'Forward ports (comma-separated)',
                    'Portas encaminhadas (separadas por vírgula)',
                  )}
                  hint={t(
                    'IDE metadata. Configure Docker port publishing in the main editor.',
                    'Metadados para a IDE. Configure publicação Docker no editor principal.',
                  )}
                >
                  <input
                    defaultValue={data.ports.join(', ')}
                    onBlur={(e) =>
                      patch({
                        ports: e.target.value
                          .split(',')
                          .map((s) => Number(s.trim()))
                          .filter((n) => n > 0 && n <= 65535),
                      })
                    }
                  />
                </Field>
                <KeyValues
                  label={t('Container environment', 'Ambiente do container')}
                  value={data.env}
                  apply={(env) => patch({ env })}
                />
              </>
            )}
            {step === 6 && (
              <>
                <Field
                  label="postCreateCommand"
                  hint={t(
                    'Runs once after container creation. Optional.',
                    'Executado após criar o container. Opcional.',
                  )}
                >
                  <textarea
                    rows={5}
                    value={data.postCreateCommand}
                    onChange={(e) => patch({ postCreateCommand: e.target.value })}
                  />
                </Field>
                <Notice>
                  {t(
                    'Nothing runs until you explicitly start or test the environment.',
                    'Nada será executado até você iniciar ou testar o ambiente explicitamente.',
                  )}
                </Notice>
              </>
            )}
            {step === 7 && (
              <>
                <div className="review-grid">
                  <span>{t('Project', 'Projeto')}</span>
                  <strong>{data.name}</strong>
                  <span>{t('Destination', 'Destino')}</span>
                  <code>{data.root}</code>
                  <span>{t('Repository', 'Repositório')}</span>
                  <code>
                    {data.repository}
                    {data.repository === 'github'
                      ? ` · ${data.githubOwner}/${data.githubName} · ${data.githubPrivate ? 'private' : 'public'}`
                      : ''}
                    {data.repository === 'clone' ? ` · ${data.repositoryUrl}` : ''}
                  </code>
                  <span>{t('Files', 'Arquivos')}</span>
                  <code>
                    .devcontainer/devcontainer.json
                    {data.base === 'dockerfile' ? ', Dockerfile' : ''}, builder.json
                  </code>
                </div>
                <pre className="code-preview">{createConfig(data)}</pre>
                <Notice>
                  {t(
                    'Create writes configuration and performs the selected Git/GitHub actions. Existing files will not be overwritten. Build and startup are separate actions.',
                    'Criar grava a configuração e executa as ações Git/GitHub selecionadas. Arquivos existentes não serão sobrescritos. Build e inicialização são ações separadas.',
                  )}
                </Notice>
              </>
            )}
            {error && <Notice danger>{error}</Notice>}
          </div>
          <footer className="wizard-footer">
            {busy && operationId && (
              <button onClick={() => void window.builder.operations.cancel(operationId)}>
                {t('Cancel operation', 'Cancelar operação')}
              </button>
            )}
            <button
              disabled={busy}
              onClick={
                step === 0
                  ? close
                  : () => {
                      setStep(step - 1)
                      setError('')
                    }
              }
            >
              <ArrowLeft size={15} />
              {step === 0 ? t('Cancel', 'Cancelar') : t('Back', 'Voltar')}
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                try {
                  if (valid()) {
                    setError('')
                    if (step < 7) setStep(step + 1)
                    else void finish()
                  }
                } catch (e) {
                  setError(String(e))
                }
              }}
            >
              {busy
                ? t('Creating…', 'Criando…')
                : step === 7
                  ? t('Create dev container', 'Criar dev container')
                  : t('Continue', 'Continuar')}
              <ArrowRight size={15} />
            </button>
          </footer>
        </div>
      </div>
    </Modal>
  )
}
