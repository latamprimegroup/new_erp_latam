'use client'

import { useEffect, useRef, useCallback } from 'react'

declare global {
  interface Window {
    onloadTurnstileCallback?: () => void
    turnstile?: {
      render: (container: HTMLElement | string, params: Record<string, unknown>) => string
      execute: (widgetId?: string) => void
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

type Props = {
  siteKey: string
  /** Recebe função execute() → Promise<token> após o widget estar montado */
  onReady: (execute: () => Promise<string>) => void
}

/**
 * Turnstile invisível: um render; a cada login o pai chama execute().
 */
export function TurnstileGate({ siteKey, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const resolverRef = useRef<((t: string) => void) | null>(null)
  const rejecterRef = useRef<((e: Error) => void) | null>(null)
  const scriptReadyRef = useRef(false)

  const clearPending = useCallback(() => {
    resolverRef.current = null
    rejecterRef.current = null
  }, [])

  const execute = useCallback(() => {
    return new Promise<string>((resolve, reject) => {
      const id = widgetIdRef.current
      const w = window.turnstile
      if (!id || !w) {
        reject(new Error('turnstile_unavailable'))
        return
      }
      resolverRef.current = resolve
      rejecterRef.current = reject
      const timer = window.setTimeout(() => {
        if (resolverRef.current === resolve) {
          clearPending()
          reject(new Error('turnstile_timeout'))
        }
      }, 25000)
      const wrapResolve = (t: string) => {
        window.clearTimeout(timer)
        clearPending()
        resolve(t)
      }
      const wrapReject = (e: Error) => {
        window.clearTimeout(timer)
        clearPending()
        reject(e)
      }
      resolverRef.current = wrapResolve
      rejecterRef.current = wrapReject
      try {
        w.reset(id)
        w.execute(id)
      } catch {
        window.clearTimeout(timer)
        clearPending()
        reject(new Error('turnstile_execute'))
      }
    })
  }, [clearPending])

  useEffect(() => {
    if (!siteKey) return

    if (document.querySelector('script[src*="turnstile/v0/api.js"]')) {
      scriptReadyRef.current = true
      return
    }

    window.onloadTurnstileCallback = () => {
      scriptReadyRef.current = true
    }
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback'
    s.async = true
    s.defer = true
    document.head.appendChild(s)
    return () => {
      delete window.onloadTurnstileCallback
    }
  }, [siteKey])

  useEffect(() => {
    if (!siteKey || !hostRef.current) return

    let cancelled = false
    const tryRender = () => {
      if (cancelled || widgetIdRef.current) return
      const host = hostRef.current
      const w = window.turnstile
      if (!host || !w) return

      const id = w.render(host, {
        sitekey: siteKey,
        size: 'invisible',
        callback: (token: string) => {
          resolverRef.current?.(token)
        },
        'error-callback': () => {
          rejecterRef.current?.(new Error('turnstile_error'))
        },
        'expired-callback': () => {
          rejecterRef.current?.(new Error('turnstile_expired'))
        },
      })
      widgetIdRef.current = id
      onReady(execute)
    }

    const iv = window.setInterval(() => {
      if (window.turnstile && hostRef.current) {
        window.clearInterval(iv)
        tryRender()
      }
    }, 100)

    const t = window.setTimeout(() => window.clearInterval(iv), 30000)
    return () => {
      cancelled = true
      window.clearInterval(iv)
      window.clearTimeout(t)
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* ignore */
        }
      }
      widgetIdRef.current = null
      clearPending()
    }
  }, [siteKey, execute, onReady, clearPending])

  if (!siteKey) return null

  return <div ref={hostRef} className="sr-only" aria-hidden />
}
