// SPDX-License-Identifier: MPL-2.0
import { useEffect, useState } from 'react'
import {
  templateCatalog,
  type ImportSource,
  type ImportDestination,
  type TemplatePreview,
} from '../../shared/catalog'
import type { Project } from '../../shared/types'
import { Field, Modal, Notice, Section, useT } from './ui'

export function TemplateLibrary({
  project,
  close,
  created,
}: {
  project?: Project
  close: () => void
  created: (p: Project) => void
}) {
  const t = useT()
  const [source, setSource] = useState<ImportSource>({ kind: 'catalog', reference: 'node' })
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState<{ id: string; name: string; description: string }[]>([])
  const [preview, setPreview] = useState<TemplatePreview>()
  const [destination, setDestination] = useState<ImportDestination>()
  const [config, setConfig] = useState('')
  const [options, setOptions] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [registry, setRegistry] = useState('ghcr.io')
  const [namespace, setNamespace] = useState('')
  const [publishReview, setPublishReview] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [operation, setOperation] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  useEffect(
    () =>
      window.builder.onEvent((event) => {
        if (['git', 'build'].includes(event.channel))
          setOperation(event.kind === 'output' ? event.id : '')
      }),
    [],
  )
  useEffect(() => {
    void window.builder.library
      .list()
      .then(setSaved)
      .catch((e) => setError(String(e)))
  }, [])
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  function show(value: TemplatePreview | null) {
    if (!value) return
    setPreview(value)
    setDestination(undefined)
    setConfig(value.configurations[0])
    setName(value.name)
    setDescription(value.description)
    setAcknowledged(false)
    setPublishReview(false)
    setOptions(
      Object.fromEntries(
        Object.entries(value.options).map(([key, meta]) => [key, meta.default ?? '']),
      ),
    )
  }
  return (
    <Modal
      wide
      title={t('Templates & import wizard', 'Wizard de templates e importação')}
      close={() => {
        if (!busy) close()
      }}
    >
      <div className="modal-body">
        <Section title={t('1. Choose a source', '1. Escolha a origem')}>
          <Field label={t('Template source', 'Origem do template')}>
            <select
              value={source.kind}
              disabled={busy}
              onChange={(e) => {
                setSource({ kind: e.target.value as ImportSource['kind'] })
                setPreview(undefined)
                setDestination(undefined)
              }}
            >
              <option value="catalog">
                {t('Development palette', 'Paleta de desenvolvimento')}
              </option>
              <option value="saved">{t('Saved templates', 'Templates salvos')}</option>
              <option value="folder">{t('Import folder', 'Importar pasta')}</option>
              <option value="zip">{t('Import ZIP', 'Importar ZIP')}</option>
              <option value="git">{t('Git repository', 'Repositório Git')}</option>
            </select>
          </Field>
          {source.kind === 'catalog' && (
            <>
              <Field label={t('Search templates', 'Pesquisar templates')}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} />
              </Field>
              <div className="feature-grid">
                {templateCatalog
                  .filter((item) =>
                    (item.name + ' ' + item.description)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((item) => (
                    <button
                      className={
                        source.reference === item.id ? 'feature-card selected' : 'feature-card'
                      }
                      key={item.id}
                      onClick={() => setSource({ kind: 'catalog', reference: item.id })}
                    >
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </button>
                  ))}
              </div>
            </>
          )}
          {source.kind === 'saved' && (
            <Field label={t('Saved template', 'Template salvo')}>
              <select
                value={source.reference ?? ''}
                onChange={(e) => setSource({ ...source, reference: e.target.value })}
              >
                <option value="">—</option>
                {saved.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {source.kind === 'git' && (
            <>
              <Field
                label={t(
                  'Git URL (empty for local repository)',
                  'URL Git (vazia para repositório local)',
                )}
              >
                <input
                  value={source.reference ?? ''}
                  onChange={(e) => setSource({ ...source, reference: e.target.value })}
                />
              </Field>
              <Field label={t('Revision, tag or commit', 'Revisão, tag ou commit')}>
                <input
                  value={source.revision ?? 'HEAD'}
                  onChange={(e) => setSource({ ...source, revision: e.target.value })}
                />
              </Field>
            </>
          )}
          {['git', 'folder'].includes(source.kind) && (
            <Field label={t('Template subfolder', 'Subpasta do template')}>
              <input
                value={source.subfolder ?? ''}
                onChange={(e) => setSource({ ...source, subfolder: e.target.value })}
              />
            </Field>
          )}
          <div className="inline">
            <button
              disabled={busy || (['saved', 'catalog'].includes(source.kind) && !source.reference)}
              onClick={() =>
                void run(async () => show(await window.builder.library.preview(source)))
              }
            >
              {t('Preview source', 'Pré-visualizar origem')}
            </button>
            {project && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => show(await window.builder.library.fromProject(project.id)))
                }
              >
                {t('Use saved files from current project', 'Usar arquivos salvos do projeto atual')}
              </button>
            )}
          </div>
        </Section>
        {preview && (
          <>
            <Section title={t('2. Review & configure', '2. Revise e configure')}>
              <h3>{preview.name}</h3>
              <p>{preview.description}</p>
              <Notice>{preview.prerequisites}</Notice>
              <Field label={t('Dev Container configuration', 'Configuração do Dev Container')}>
                <select value={config} onChange={(e) => setConfig(e.target.value)}>
                  {preview.configurations.map((file) => (
                    <option key={file}>{file}</option>
                  ))}
                </select>
              </Field>
              {Object.entries(preview.options).map(([key, meta]) => (
                <Field key={key} label={meta.description || key}>
                  {meta.enum ? (
                    <select
                      value={options[key]}
                      onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
                    >
                      {meta.enum.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={options[key] ?? ''}
                      onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
              <details>
                <summary>
                  {t('Files in preview', 'Arquivos na prévia')} ({preview.files.length})
                </summary>
                <div className="code-preview">
                  {preview.files.map((f) => (
                    <div key={f.path}>
                      {f.path} · {f.size} B
                    </div>
                  ))}
                </div>
              </details>
              {preview.excluded.length > 0 && (
                <details>
                  <summary>
                    {t(
                      'Excluded credentials, metadata and links',
                      'Credenciais, metadados e links excluídos',
                    )}
                  </summary>
                  <pre className="code-preview">{preview.excluded.join('\n')}</pre>
                </details>
              )}
              <Field label={t('Template name', 'Nome do template')}>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t('Template description', 'Descrição do template')}>
                <input value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <button
                disabled={busy || !name}
                onClick={() =>
                  void run(async () => {
                    await window.builder.library.save(preview.id, name, description)
                    setSaved(await window.builder.library.list())
                    setResult(
                      t(
                        'Template saved to the local library.',
                        'Template salvo na biblioteca local.',
                      ),
                    )
                  })
                }
              >
                {t('Save reusable template', 'Salvar template reutilizável')}
              </button>
            </Section>
            <Section title={t('3. Destination & create', '3. Destino e criação')}>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const value = await window.builder.library.destination(preview.id)
                    if (value) {
                      setDestination(value)
                      setAcknowledged(false)
                    }
                  })
                }
              >
                {t('Choose destination for review', 'Escolher destino para revisão')}
              </button>
              {destination && (
                <>
                  <p className="mono">{destination.path}</p>
                  {destination.conflicts.length > 0 && (
                    <Notice danger>
                      {t(
                        'Existing files prevent import. Choose another destination:',
                        'Arquivos existentes impedem a importação. Escolha outro destino:',
                      )}
                      <pre>{destination.conflicts.join('\n')}</pre>
                    </Notice>
                  )}
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    {t(
                      'I reviewed the files, configuration and destination. Missing lifecycle helper scripts will also be created. No hooks will run.',
                      'Revisei os arquivos, a configuração e o destino. Scripts auxiliares ausentes também serão criados. Nenhum hook será executado.',
                    )}
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !acknowledged || destination.conflicts.length > 0}
                    onClick={() =>
                      void run(async () =>
                        created(
                          await window.builder.library.apply(
                            preview.id,
                            destination.id,
                            config,
                            options,
                          ),
                        ),
                      )
                    }
                  >
                    {t('Create & open for fine-tuning', 'Criar e abrir para ajuste fino')}
                  </button>
                </>
              )}
            </Section>
            <details>
              <summary>{t('Publish OCI template', 'Publicar template OCI')}</summary>
              <Field label="Registry">
                <input value={registry} onChange={(e) => setRegistry(e.target.value)} />
              </Field>
              <Field label="Namespace">
                <input value={namespace} onChange={(e) => setNamespace(e.target.value)} />
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={publishReview}
                  onChange={(e) => setPublishReview(e.target.checked)}
                />
                {t(
                  'Publish these reviewed files to this registry/namespace using my registry credentials.',
                  'Publicar estes arquivos revisados neste registry/namespace usando minhas credenciais do registry.',
                )}
              </label>
              <button
                disabled={busy || !publishReview || !namespace}
                onClick={() =>
                  void run(async () =>
                    setResult(
                      await window.builder.library.publish(preview.id, registry, namespace),
                    ),
                  )
                }
              >
                {t('Publish reviewed template', 'Publicar template revisado')}
              </button>
            </details>
          </>
        )}
        {busy && (
          <Notice>
            {t('Working…', 'Processando…')}
            {operation && (
              <button onClick={() => void window.builder.operations.cancel(operation)}>
                {t('Cancel operation', 'Cancelar operação')}
              </button>
            )}
          </Notice>
        )}
        {error && <Notice danger>{error}</Notice>}
        {result && <Notice>{result}</Notice>}
      </div>
    </Modal>
  )
}
