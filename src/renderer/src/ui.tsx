// SPDX-License-Identifier: MPL-2.0
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as monaco from 'monaco-editor'
import { restoreMonacoHoverServices } from './monaco'
import { Plus, Trash2, X } from 'lucide-react'
import type { Locale } from '../../shared/types'
import { useTheme } from './themes'
export const LocaleContext = createContext<Locale>('pt-BR')
export function useT(): (en: string, pt: string) => string {
  const locale = useContext(LocaleContext)
  return (en, pt) => (locale === 'en' ? en : pt)
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
export function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {description && <p className="muted section-description">{description}</p>}
      {children}
    </section>
  )
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return <div className={`notice ${danger ? 'danger' : ''}`}>{children}</div>
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string
  children: ReactNode
  close: () => void
  wide?: boolean
}) {
  const t = useT()
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <section
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" title={t('Close', 'Fechar')} onClick={close}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
export function Code({
  value,
  onChange,
  language = 'json',
  height = '430px',
  readOnly = false,
}: {
  value: string
  onChange?: (value: string) => void
  language?: string
  height?: string
  readOnly?: boolean
}) {
  const theme = useTheme()
  const element = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const changed = useRef(onChange)
  const updating = useRef(false)
  changed.current = onChange
  useEffect(() => {
    if (!element.current) return
    const model = monaco.editor.createModel(value, language)
    const instance = monaco.editor.create(element.current, {
      model,
      theme: theme.id,
      readOnly,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
      padding: { top: 16 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
    })
    restoreMonacoHoverServices()
    editor.current = instance
    const subscription = model.onDidChangeContent(() => {
      if (!updating.current) changed.current?.(model.getValue())
    })
    return () => {
      subscription.dispose()
      instance.setModel(null)
      instance.dispose()
      model.dispose()
      editor.current = null
    }
  }, [])
  useEffect(() => {
    const model = editor.current?.getModel()
    if (model && model.getValue() !== value) {
      updating.current = true
      model.setValue(value)
      updating.current = false
    }
    if (model) monaco.editor.setModelLanguage(model, language)
    editor.current?.updateOptions({ readOnly })
  }, [value, language, readOnly])
  return <div ref={element} style={{ height }} />
}
export function Diff({
  original,
  modified,
  language = 'json',
}: {
  original: string
  modified: string
  language?: string
}) {
  const theme = useTheme()
  const element = useRef<HTMLDivElement>(null)
  const models = useRef<{
    original: monaco.editor.ITextModel
    modified: monaco.editor.ITextModel
  } | null>(null)
  useEffect(() => {
    if (!element.current) return
    const pair = {
      original: monaco.editor.createModel(original, language),
      modified: monaco.editor.createModel(modified, language),
    }
    const instance = monaco.editor.createDiffEditor(element.current, {
      theme: theme.id,
      readOnly: true,
      minimap: { enabled: false },
      renderSideBySide: true,
      automaticLayout: true,
    })
    instance.setModel(pair)
    restoreMonacoHoverServices()
    models.current = pair
    return () => {
      instance.setModel(null)
      instance.dispose()
      pair.original.dispose()
      pair.modified.dispose()
      models.current = null
    }
  }, [])
  useEffect(() => {
    if (!models.current) return
    if (models.current.original.getValue() !== original) models.current.original.setValue(original)
    if (models.current.modified.getValue() !== modified) models.current.modified.setValue(modified)
    monaco.editor.setModelLanguage(models.current.original, language)
    monaco.editor.setModelLanguage(models.current.modified, language)
  }, [original, modified, language])
  return <div ref={element} style={{ height: 360 }} />
}
export function JsonField({
  label,
  value,
  apply,
}: {
  label: string
  value: unknown
  apply: (value: unknown) => void
}) {
  const t = useT()
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2))
  const [error, setError] = useState('')
  useEffect(() => setText(JSON.stringify(value ?? {}, null, 2)), [value])
  return (
    <div className="json-field">
      <Field label={label}>
        <textarea
          className="mono"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className="inline">
        <button
          onClick={() => {
            try {
              apply(JSON.parse(text))
              setError('')
            } catch (e) {
              setError(String(e))
            }
          }}
        >
          {t('Apply', 'Aplicar')}
        </button>
        {error && <small className="error-text">{error}</small>}
      </div>
    </div>
  )
}
export function KeyValues({
  value,
  apply,
  label,
}: {
  value: Record<string, unknown>
  apply: (value: Record<string, string>) => void
  label: string
}) {
  const t = useT()
  const [rows, setRows] = useState(
    Object.entries(value).map(([key, value]) => ({ key, value: String(value) })),
  )
  return (
    <div>
      <div className="table-label">{label}</div>
      {rows.map((row, index) => (
        <div className="kv-row" key={index}>
          <input
            aria-label={t('Key', 'Chave')}
            placeholder="KEY"
            value={row.key}
            onChange={(e) =>
              setRows(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))
            }
          />
          <input
            aria-label={t('Value', 'Valor')}
            placeholder={t('Value', 'Valor')}
            value={row.value}
            onChange={(e) =>
              setRows(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
            }
          />
          <button
            className="icon-button"
            title={t('Remove', 'Remover')}
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <div className="inline">
        <button onClick={() => setRows([...rows, { key: '', value: '' }])}>
          <Plus size={14} />
          {t('Add variable', 'Adicionar variável')}
        </button>
        <button
          onClick={() =>
            apply(Object.fromEntries(rows.filter((r) => r.key.trim()).map((r) => [r.key, r.value])))
          }
        >
          {t('Apply', 'Aplicar')}
        </button>
      </div>
    </div>
  )
}
