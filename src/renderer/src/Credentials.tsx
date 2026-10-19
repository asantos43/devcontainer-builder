// SPDX-License-Identifier: MPL-2.0
import { useEffect, useState } from 'react'
import { Field, Notice, Section, useT } from './ui'
export function CredentialStore({ run }: { run: (fn: () => Promise<unknown>) => void }) {
  const t = useT()
  const [names, setNames] = useState<string[]>([])
  const [name, setName] = useState('registry-token')
  const [value, setValue] = useState('')
  const [selected, select] = useState('')
  const [server, setServer] = useState('ghcr.io')
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    void window.builder.vault
      .list()
      .then(setNames)
      .catch(() => {})
  }, [])
  return (
    <Section
      title={t('OS credential store', 'Armazenamento de credenciais do sistema')}
      description={t(
        'Secrets are encrypted using Windows DPAPI, macOS Keychain or Linux Secret Service/KWallet. Plaintext fallback is refused. Values never appear in projects or exports.',
        'Secrets são criptografados usando Windows DPAPI, macOS Keychain ou Linux Secret Service/KWallet. Armazenamento sem criptografia é recusado. Os valores ficam fora de projetos e exportações.',
      )}
    >
      <Field label={t('Credential name', 'Nome da credencial')}>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('Credential value', 'Valor da credencial')}>
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <button
        disabled={!name || !value}
        onClick={() =>
          run(async () => {
            try {
              await window.builder.vault.store(name, value)
              setNames(await window.builder.vault.list())
              setMessage(t('Credential saved.', 'Credencial salva.'))
            } finally {
              setValue('')
            }
          })
        }
      >
        {t('Save encrypted credential', 'Salvar credencial criptografada')}
      </button>
      <Field label={t('Saved credential', 'Credencial salva')}>
        <select value={selected} onChange={(e) => select(e.target.value)}>
          <option value="">—</option>
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </Field>
      <button
        disabled={!selected}
        onClick={() =>
          run(async () => {
            if (
              window.confirm(t('Delete this saved credential?', 'Apagar esta credencial salva?'))
            ) {
              await window.builder.vault.remove(selected)
              setNames(await window.builder.vault.list())
              select('')
            }
          })
        }
      >
        {t('Delete selected credential', 'Apagar credencial selecionada')}
      </button>
      <Field label="Registry">
        <input value={server} onChange={(e) => setServer(e.target.value)} />
      </Field>
      <Field label={t('Registry username', 'Usuário do registry')}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <button
        disabled={!selected || !username || !server}
        onClick={() =>
          run(async () => {
            await window.builder.vault.registry(selected, server, username)
            setMessage(
              t(
                'Registry authenticated with saved credential.',
                'Registry autenticado com a credencial salva.',
              ),
            )
          })
        }
      >
        {t('Use credential to sign in to registry', 'Usar credencial para entrar no registry')}
      </button>
      <p className="muted">
        {t(
          'Saved credentials can also be selected when cloning private HTTPS repositories into new volumes.',
          'Credenciais salvas também podem ser selecionadas ao clonar repositórios HTTPS privados em novos volumes.',
        )}
      </p>
      {message && <Notice>{message}</Notice>}
    </Section>
  )
}
