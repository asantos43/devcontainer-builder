// SPDX-License-Identifier: MPL-2.0
import { useState } from 'react'
import { parseDocument } from 'yaml'
import type { Config, Project } from '../../shared/types'
import { patchConfig, readConfig } from '../../shared/config'
import { composeServices, patchCompose, relativeComposePath } from '../../shared/compose'
import { Code, Diff, Field, JsonField, Notice, Section, useT } from './ui'
type Run = (fn: () => Promise<unknown>) => void
export function ComposeEditor({
  project,
  update,
}: {
  project: Project
  update: (p: Project) => void
}) {
  const t = useT()
  const c = readConfig(project.configText).config
  const files = Object.keys(project.composeFiles ?? {})
  const [selected, select] = useState('')
  const [service, setService] = useState(String(c.service ?? 'app'))
  const [newService, setNewService] = useState('database')
  const [error, setError] = useState('')
  const file = files.includes(selected) ? selected : files[0]
  const source = project.composeFiles?.[file] ?? ''
  let services: string[] = []
  try {
    services = composeServices(source)
  } catch {
    /* raw editor remains available */
  }
  const doc = parseDocument(source)
  const value = doc.getIn(['services', service])
  const model =
    value && typeof value === 'object' && 'toJSON' in value && typeof value.toJSON === 'function'
      ? (value.toJSON() as Config)
      : {}
  function apply(key: (string | number)[], value: unknown) {
    try {
      update({
        ...project,
        composeFiles: { ...project.composeFiles, [file]: patchCompose(source, key, value) },
      })
      setError('')
    } catch (e) {
      setError(String(e))
    }
  }
  function enable() {
    const directory = project.configPath.includes('/')
      ? project.configPath.slice(0, project.configPath.lastIndexOf('/') + 1)
      : ''
    const filename = directory + 'compose.yaml'
    let configText = project.configText
    for (const key of ['image', 'build', 'dockerFile', 'workspaceMount'])
      configText = patchConfig(configText, [key], undefined)
    configText = patchConfig(configText, ['dockerComposeFile'], 'compose.yaml')
    configText = patchConfig(configText, ['service'], 'app')
    const build = c.build as Config | undefined
    const serviceConfig = {
      ...(c.image
        ? { image: c.image }
        : {
            build: {
              context: build?.context ?? '..',
              dockerfile: relativeComposePath(
                String(build?.context ?? '..'),
                String(build?.dockerfile ?? 'Dockerfile'),
                directory.replace(/\/$/, ''),
              ),
            },
          }),
      command: 'sleep infinity',
      volumes: [`${directory ? '..' : '.'}:${c.workspaceFolder || '/workspace'}`],
    }
    const compose = patchCompose(
      '# Compose services managed with DevContainer Builder\nservices: {}\n',
      ['services', 'app'],
      serviceConfig,
    )
    update({
      ...project,
      configText,
      composeFiles: { ...project.composeFiles, [filename]: compose },
    })
    setService('app')
  }
  return (
    <>
      <Section
        title="Docker Compose"
        description={t(
          'Edit services and YAML comments; startup uses the official Dev Containers CLI and your selected engine.',
          'Edite serviços e comentários YAML; a execução usa a CLI oficial e o motor selecionado.',
        )}
      >
        {!c.dockerComposeFile ? (
          <button onClick={enable}>
            {t('Use Compose for this environment', 'Usar Compose neste ambiente')}
          </button>
        ) : (
          <>
            <Field label={t('Compose file', 'Arquivo Compose')}>
              <select value={file} onChange={(e) => select(e.target.value)}>
                {files.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label={t('Service to edit', 'Serviço para editar')}>
              <select value={service} onChange={(e) => setService(e.target.value)}>
                {services.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            {services.includes(service) && (
              <>
                <Field label={t('Service image', 'Imagem do serviço')}>
                  <input
                    value={String(model.image ?? '')}
                    onChange={(e) =>
                      apply(['services', service, 'image'], e.target.value || undefined)
                    }
                  />
                </Field>
                {['build', 'ports', 'volumes', 'environment', 'depends_on'].map((key) => (
                  <JsonField
                    key={service + key}
                    label={key}
                    value={model[key] ?? (key === 'build' || key === 'environment' ? {} : [])}
                    apply={(v) => apply(['services', service, key], v)}
                  />
                ))}
                <button
                  onClick={() =>
                    update({
                      ...project,
                      configText: patchConfig(project.configText, ['service'], service),
                    })
                  }
                >
                  {t('Use as development service', 'Usar como serviço de desenvolvimento')}
                </button>
              </>
            )}
            <div className="inline">
              <input
                aria-label={t('New service name', 'Nome do novo serviço')}
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
              />
              <button
                disabled={
                  !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(newService) || services.includes(newService)
                }
                onClick={() => {
                  apply(['services', newService], {
                    image: 'postgres:17',
                    environment: {
                      POSTGRES_PASSWORD: '${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}',
                    },
                  })
                  setService(newService)
                }}
              >
                {t('Add service', 'Adicionar serviço')}
              </button>
            </div>
            <JsonField
              label="runServices"
              value={c.runServices ?? []}
              apply={(v) =>
                update({
                  ...project,
                  configText: patchConfig(project.configText, ['runServices'], v),
                })
              }
            />
            <Code
              language="yaml"
              height="440px"
              value={source}
              onChange={(text) =>
                update({ ...project, composeFiles: { ...project.composeFiles, [file]: text } })
              }
            />
          </>
        )}
        {error && <Notice danger>{error}</Notice>}
      </Section>
    </>
  )
}
export function FeatureMaintenance({
  project,
  update,
  run,
}: {
  project: Project
  update: (p: Project) => void
  run: Run
}) {
  const t = useT()
  const [versions, setVersions] = useState('')
  const [lock, setLock] = useState('')
  const [oldRef, setOldRef] = useState('')
  const [newRef, setNewRef] = useState('')
  const features = (readConfig(project.configText).config.features ?? {}) as Config
  return (
    <Section title={t('Feature updates', 'Atualizações de Features')}>
      <div className="inline">
        <button
          onClick={() =>
            run(async () =>
              setVersions(await window.builder.maintenance.featureVersions(project.id)),
            )
          }
        >
          {t('Check available versions', 'Consultar versões disponíveis')}
        </button>
        <button
          onClick={() =>
            run(async () => setLock(await window.builder.maintenance.featureLock(project.id)))
          }
        >
          {t('Preview updated lockfile', 'Pré-visualizar lockfile atualizado')}
        </button>
      </div>
      {versions && <pre className="code-preview">{versions}</pre>}
      <div className="grid-two">
        <Field label={t('Current Feature', 'Feature atual')}>
          <select value={oldRef} onChange={(e) => setOldRef(e.target.value)}>
            <option value="">—</option>
            {Object.keys(features).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label={t('New Feature reference', 'Nova referência da Feature')}>
          <input
            value={newRef}
            onChange={(e) => setNewRef(e.target.value)}
            placeholder="ghcr.io/devcontainers/features/node:1"
          />
        </Field>
      </div>
      <button
        disabled={!oldRef || !newRef || oldRef === newRef || newRef in features}
        onClick={() => {
          let source = patchConfig(project.configText, ['features', newRef], features[oldRef])
          source = patchConfig(source, ['features', oldRef], undefined)
          update({ ...project, configText: source })
        }}
      >
        {t('Stage Feature replacement', 'Preparar substituição da Feature')}
      </button>
      {lock && (
        <>
          <Code value={lock} readOnly height="240px" />
          <button
            onClick={() =>
              run(async () => {
                await window.builder.maintenance.saveFeatureLock(project.id, lock)
                setLock('')
              })
            }
          >
            {t('Save reviewed lockfile', 'Salvar lockfile revisado')}
          </button>
        </>
      )}
    </Section>
  )
}
export function AccessAssistant({
  project,
  update,
}: {
  project: Project
  update: (p: Project) => void
}) {
  const t = useT()
  const [name, setName] = useState('API_TOKEN')
  const [socket, setSocket] = useState('${localEnv:SSH_AUTH_SOCK}')
  const [engineSocket, setEngineSocket] = useState('/var/run/docker.sock')
  const patch = (key: (string | number)[], value: unknown) =>
    update({ ...project, configText: patchConfig(project.configText, key, value) })
  function mountAgent() {
    const c = readConfig(project.configText).config
    const mounts = Array.isArray(c.mounts) ? c.mounts : []
    let source = patchConfig(
      project.configText,
      ['mounts'],
      [...mounts, `type=bind,source=${socket},target=/run/dcb-ssh-agent`],
    )
    source = patchConfig(source, ['remoteEnv', 'SSH_AUTH_SOCK'], '/run/dcb-ssh-agent')
    update({ ...project, configText: source })
  }
  return (
    <Section title={t('SSH agent & secret references', 'Agente SSH e referências de secrets')}>
      <Field label={t('Host environment variable', 'Variável de ambiente do host')}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <button
        disabled={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)}
        onClick={() => patch(['remoteEnv', name], '${localEnv:' + name + '}')}
      >
        {t('Add secret reference', 'Adicionar referência de secret')}
      </button>
      <Field label={t('SSH agent socket on engine host', 'Socket do agente SSH no host do motor')}>
        <input value={socket} onChange={(e) => setSocket(e.target.value)} />
      </Field>
      <button disabled={!socket || /[,\n]/.test(socket)} onClick={mountAgent}>
        {t('Forward SSH agent', 'Encaminhar agente SSH')}
      </button>
      <Field
        label={t('Docker/Podman socket on engine host', 'Socket Docker/Podman no host do motor')}
      >
        <input value={engineSocket} onChange={(e) => setEngineSocket(e.target.value)} />
      </Field>
      <button
        disabled={!engineSocket.startsWith('/') || /[,\n]/.test(engineSocket)}
        onClick={() => {
          const c = readConfig(project.configText).config
          let source = patchConfig(
            project.configText,
            ['mounts'],
            [
              ...(Array.isArray(c.mounts) ? c.mounts : []),
              `type=bind,source=${engineSocket},target=/var/run/docker.sock`,
            ],
          )
          source = patchConfig(source, ['remoteEnv', 'DOCKER_HOST'], 'unix:///var/run/docker.sock')
          update({ ...project, configText: source })
        }}
      >
        {t('Mount host engine socket', 'Montar socket do motor do host')}
      </button>
      <Notice>
        {t(
          'Only references are saved. Configure environment variables and agent permissions on the host. Socket forwarding grants the container access to that agent or engine. On SELinux hosts, review label and socket permissions. Docker in Docker is available in Features and runs a separate privileged daemon.',
          'Somente referências são salvas. Configure as variáveis e permissões do agente no host. O encaminhamento de sockets dá ao container acesso ao agente ou motor. Em hosts SELinux, revise labels e permissões. Docker in Docker está disponível em Features e usa um daemon separado com privilégios.',
        )}
      </Notice>
    </Section>
  )
}
export function VolumeManager({
  project,
  update,
  run,
}: {
  project: Project
  update: (p: Project) => void
  run: Run
}) {
  const t = useT()
  const [volumes, setVolumes] = useState<string[]>([])
  const [existing, setExisting] = useState('')
  const [name, setName] = useState('workspace-copy')
  const [url, setUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [result, setResult] = useState('')
  const [cloned, setCloned] = useState('')
  return (
    <Section title={t('Volume data & repositories', 'Dados de volumes e repositórios')}>
      <button onClick={() => run(async () => setVolumes(await window.builder.docker.volumes()))}>
        {t('List volumes', 'Listar volumes')}
      </button>
      <Field label={t('Volume to back up', 'Volume para backup')}>
        <select value={existing} onChange={(e) => setExisting(e.target.value)}>
          <option value="">—</option>
          {volumes.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <button
        disabled={!existing}
        onClick={() =>
          run(async () =>
            setResult((await window.builder.maintenance.backupVolume(existing)) ?? ''),
          )
        }
      >
        {t('Export volume as TAR', 'Exportar volume como TAR')}
      </button>
      <Field label={t('New volume name', 'Nome do novo volume')}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <button
        disabled={!name}
        onClick={() =>
          run(async () => setResult((await window.builder.maintenance.restoreVolume(name)) ?? ''))
        }
      >
        {t('Restore TAR into a new volume', 'Restaurar TAR em um novo volume')}
      </button>
      <Field label={t('Public repository HTTPS URL', 'URL HTTPS do repositório público')}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Branch">
        <input value={branch} onChange={(e) => setBranch(e.target.value)} />
      </Field>
      <button
        disabled={!url || !name}
        onClick={() =>
          run(async () => {
            const volume = await window.builder.maintenance.cloneVolume(name, url, branch)
            setCloned(volume)
            setResult(volume)
          })
        }
      >
        {t('Clone repository into new volume', 'Clonar repositório em novo volume')}
      </button>
      {cloned && (
        <button
          onClick={() => {
            const c = readConfig(project.configText).config
            const folder = String(c.workspaceFolder ?? '/workspace')
            let source = patchConfig(
              project.configText,
              ['workspaceMount'],
              `type=volume,source=${cloned},target=${folder}`,
            )
            source = patchConfig(
              source,
              ['workspaceFolder'],
              folder.replace(/\/$/, '') + '/repository',
            )
            update({ ...project, configText: source })
          }}
        >
          {t('Use cloned volume as workspace', 'Usar volume clonado como workspace')}
        </button>
      )}
      {result && <Notice>{result}</Notice>}
      <p className="muted">
        {t(
          'Stop containers before backup. Backups include all volume data, including secrets. Restore only accepts regular files/directories in a new volume; links and devices are rejected. Failed clones/restores leave partial data in that volume.',
          'Pare os containers antes do backup. Backups incluem todos os dados, inclusive secrets. A restauração aceita apenas arquivos/diretórios em um volume novo; links e devices são rejeitados. Falhas preservam dados parciais no novo volume.',
        )}
      </p>
    </Section>
  )
}
export function CompareConfiguration({ project, run }: { project: Project; run: Run }) {
  const t = useT()
  const [other, setOther] = useState<string | null>(null)
  return (
    <Section title={t('Compare configurations', 'Comparar configurações')}>
      <button onClick={() => run(async () => setOther(await window.builder.maintenance.compare()))}>
        {t('Choose another configuration', 'Escolher outra configuração')}
      </button>
      {other !== null && <Diff original={other} modified={project.configText} />}
    </Section>
  )
}
export function SecurityTools({ project, run }: { project: Project; run: Run }) {
  const t = useT()
  const [result, setResult] = useState('')
  return (
    <Section
      title={t('SBOM & vulnerability reports', 'SBOM e relatórios de vulnerabilidades')}
      description={t(
        'Install Trivy on the host. Reports analyze project dependencies on disk; they do not scan the built image or running container.',
        'Instale o Trivy no host. Os relatórios analisam dependências do projeto em disco; não analisam a imagem construída ou o container em execução.',
      )}
    >
      <div className="inline">
        <button
          onClick={() =>
            run(async () => setResult(await window.builder.maintenance.scan(project.id, 'sbom')))
          }
        >
          {t('Export CycloneDX SBOM', 'Exportar SBOM CycloneDX')}
        </button>
        <button
          onClick={() =>
            run(async () =>
              setResult(await window.builder.maintenance.scan(project.id, 'vulnerabilities')),
            )
          }
        >
          {t('Scan dependency vulnerabilities', 'Analisar vulnerabilidades das dependências')}
        </button>
      </div>
      {result && <Notice>{result}</Notice>}
    </Section>
  )
}
export function ApplicationTools({ run, opened }: { run: Run; opened: (p: Project) => void }) {
  const t = useT()
  const [server, setServer] = useState('ghcr.io')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [template, setTemplate] = useState('ghcr.io/devcontainers/templates/javascript-node:1')
  const [options, setOptions] = useState<Record<string, string>>({})
  const [result, setResult] = useState('')
  return (
    <>
      <Section title={t('Registry authentication', 'Autenticação em registries')}>
        <Field label={t('Registry server', 'Servidor do registry')}>
          <input value={server} onChange={(e) => setServer(e.target.value)} />
        </Field>
        <Field label={t('Registry username', 'Usuário do registry')}>
          <input
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label={t('Registry password or token', 'Senha ou token do registry')}>
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="inline">
          <button
            disabled={!server || !username || !password}
            onClick={() =>
              run(async () => {
                try {
                  await window.builder.maintenance.registryLogin(server, username, password)
                  setResult(
                    t(
                      'Registry login saved by the engine credential store.',
                      'Login salvo no armazenamento de credenciais do motor.',
                    ),
                  )
                } finally {
                  setPassword('')
                }
              })
            }
          >
            {t('Sign in to registry', 'Entrar no registry')}
          </button>
          <button
            onClick={() =>
              run(async () => {
                await window.builder.maintenance.registryLogout(server)
                setResult(t('Signed out.', 'Sessão encerrada.'))
              })
            }
          >
            {t('Sign out of registry', 'Sair do registry')}
          </button>
        </div>
        <p className="muted">
          {t(
            'Credentials stay in the engine store, outside projects and exports. Podman uses the Docker auth file for compatibility with the Dev Containers CLI.',
            'Credenciais ficam no armazenamento do motor, fora de projetos e exportações. Podman usa o arquivo de autenticação Docker para compatibilidade com a CLI de Dev Containers.',
          )}
        </p>
      </Section>
      <Section title={t('Create from an OCI template', 'Criar a partir de um template OCI')}>
        <Field label={t('OCI template reference', 'Referência do template OCI')}>
          <input value={template} onChange={(e) => setTemplate(e.target.value)} />
        </Field>
        <JsonField
          label={t('Template options', 'Opções do template')}
          value={options}
          apply={(v) => setOptions(v as Record<string, string>)}
        />
        <button
          onClick={() =>
            run(async () => {
              const p = await window.builder.maintenance.applyTemplate(template, options)
              if (p) opened(p)
            })
          }
        >
          {t('Choose empty destination & create', 'Escolher destino vazio e criar')}
        </button>
      </Section>
      <Section
        title={t('Application updates', 'Atualizações do aplicativo')}
        description={t(
          'Packaged apps use published GitHub Releases. While this repository is private, launch with GH_TOKEN or GITHUB_TOKEN. Check, download and restart are separate actions.',
          'Aplicativos empacotados usam GitHub Releases publicados. Enquanto o repositório for privado, inicie com GH_TOKEN ou GITHUB_TOKEN. Verificar, baixar e reiniciar são ações separadas.',
        )}
      >
        <div className="inline">
          {(['check', 'download', 'install'] as const).map((action, i) => (
            <button
              key={action}
              onClick={() =>
                run(async () => {
                  if (
                    action !== 'install' ||
                    window.confirm(
                      t(
                        'Restart and install the downloaded update?',
                        'Reiniciar e instalar a atualização baixada?',
                      ),
                    )
                  )
                    setResult(await window.builder.maintenance.update(action))
                })
              }
            >
              {
                [
                  t('Check updates', 'Verificar atualizações'),
                  t('Download update', 'Baixar atualização'),
                  t('Restart & install', 'Reiniciar e instalar'),
                ][i]
              }
            </button>
          ))}
        </div>
      </Section>
      {result && <Notice>{result}</Notice>}
    </>
  )
}
