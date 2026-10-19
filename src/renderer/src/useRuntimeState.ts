// SPDX-License-Identifier: MPL-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimeState } from '../../shared/types'

export function useRuntimeState(projectId: string | undefined, connectionKey: string) {
  const key = JSON.stringify([projectId, connectionKey])
  const [snapshot, setSnapshot] = useState<{ key: string; state: RuntimeState }>()
  const refresh = useRef<() => Promise<void>>(async () => {})
  const refreshState = useCallback(() => refresh.current(), [])

  useEffect(() => {
    if (!projectId) return
    let disposed = false
    let inFlight: Promise<void> | undefined
    const update = async (): Promise<void> => {
      if (disposed) return
      if (inFlight) return inFlight
      inFlight = (async () => {
        try {
          const state = await window.builder.runtime.state(projectId)
          if (!disposed) setSnapshot({ key, state })
        } catch {
          if (!disposed) setSnapshot({ key, state: { status: 'unavailable' } })
        }
      })()
      try {
        await inFlight
      } finally {
        inFlight = undefined
      }
    }
    refresh.current = update
    const onFocus = () => void update()
    void update()
    const timer = window.setInterval(onFocus, 3000)
    window.addEventListener('focus', onFocus)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      refresh.current = async () => {}
    }
  }, [projectId, key])

  const state: RuntimeState = !projectId
    ? { status: 'not-created' }
    : snapshot?.key === key
      ? snapshot.state
      : { status: 'checking' }
  return { state, refreshState }
}
