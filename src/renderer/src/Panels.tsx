// SPDX-License-Identifier: MPL-2.0
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { PlugZap, Unplug } from 'lucide-react'
import type { Project } from '../../shared/types'
import { useT } from './ui'
import '@xterm/xterm/css/xterm.css'

const terminalTheme = {
  background: '#14161a',
  foreground: '#cdd2dc',
  cursor: '#67d2b5',
  selectionBackground: '#2b3c4b',
  black: '#22252d',
  red: '#ed8796',
  green: '#a6da95',
  yellow: '#eed49f',
  blue: '#8aadf4',
  magenta: '#c6a0f6',
  cyan: '#8bd5ca',
  white: '#cad3f5',
}
export function OutputTerminal({ text }: { text: string }) {
  const element = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | undefined>(undefined)
  const previous = useRef('')
  useEffect(() => {
    if (!element.current) return
    const term = new Terminal({
      disableStdin: true,
      convertEol: true,
      fontSize: 12,
      fontFamily: 'monospace',
      scrollback: 5000,
      theme: terminalTheme,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element.current)
    terminal.current = term
    const observer = new ResizeObserver(() => {
      if (element.current?.clientWidth) fit.fit()
    })
    observer.observe(element.current)
    return () => {
      observer.disconnect()
      term.dispose()
      terminal.current = undefined
      previous.current = ''
    }
  }, [])
  useEffect(() => {
    const term = terminal.current
    if (!term) return
    if (text.startsWith(previous.current)) term.write(text.slice(previous.current.length))
    else {
      term.reset()
      term.write(text)
    }
    previous.current = text
  }, [text])
  return <div className="terminal-host" ref={element} />
}
export function InteractiveTerminal({
  project,
  error,
}: {
  project: Project
  error: (value: string) => void
}) {
  const t = useT()
  const element = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | undefined>(undefined)
  const fit = useRef<FitAddon | undefined>(undefined)
  const session = useRef<string | undefined>(undefined)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  useEffect(() => {
    if (!element.current) return
    const term = new Terminal({
      fontSize: 12,
      fontFamily: 'monospace',
      scrollback: 5000,
      cursorBlink: true,
      theme: terminalTheme,
    })
    const addon = new FitAddon()
    term.loadAddon(addon)
    term.open(element.current)
    terminal.current = term
    fit.current = addon
    const resize = () => {
      if (element.current?.clientWidth) {
        addon.fit()
        if (session.current)
          void window.builder.terminal
            .resize(session.current, term.cols, term.rows)
            .catch((e) => error(String(e)))
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element.current)
    const input = term.onData((data) => {
      if (session.current)
        void window.builder.terminal.write(session.current, data).catch((e) => error(String(e)))
    })
    const remove = window.builder.onEvent((event) => {
      if (event.channel === 'terminal' && event.projectId === project.id) {
        term.write(event.text)
        if (event.kind !== 'output') {
          session.current = undefined
          setConnected(false)
        }
      }
    })
    return () => {
      remove()
      input.dispose()
      observer.disconnect()
      if (session.current) void window.builder.terminal.close(session.current)
      session.current = undefined
      term.dispose()
      terminal.current = undefined
    }
  }, [project.id, error])
  async function connect() {
    setConnecting(true)
    try {
      session.current = await window.builder.terminal.open(project.id)
      setConnected(true)
      fit.current?.fit()
      if (terminal.current)
        await window.builder.terminal.resize(
          session.current,
          terminal.current.cols,
          terminal.current.rows,
        )
      terminal.current?.focus()
    } catch (e) {
      error(String(e))
    } finally {
      setConnecting(false)
    }
  }
  return (
    <div className="interactive-terminal">
      <div className="terminal-tools">
        <span className={connected ? 'green-text' : 'muted'}>
          ● {connected ? t('Connected', 'Conectado') : t('Not connected', 'Desconectado')}
        </span>
        {connected ? (
          <button
            onClick={async () => {
              if (session.current) await window.builder.terminal.close(session.current)
              session.current = undefined
              setConnected(false)
            }}
          >
            <Unplug size={13} />
            {t('Disconnect', 'Desconectar')}
          </button>
        ) : (
          <button disabled={connecting} onClick={() => void connect()}>
            <PlugZap size={13} />
            {t('Connect shell', 'Conectar shell')}
          </button>
        )}
      </div>
      <div className="terminal-host" ref={element} />
    </div>
  )
}
