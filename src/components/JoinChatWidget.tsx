'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

/**
 * Widget Join.Chat (melhoria 008)
 * Carrega via CDN quando joinchat_id está configurado em SystemSetting.
 */
export function JoinChatWidget() {
  const [joinchatId, setJoinchatId] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 5000)
    fetch('/api/config/public', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.joinchatId) setJoinchatId(d.joinchatId)
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeout))
    return () => {
      clearTimeout(timeout)
      ctrl.abort()
    }
  }, [])

  if (!joinchatId) return null

  return (
    <Script
      src={`https://cdn.join.chat/bundle/${joinchatId}.js`}
      strategy="lazyOnload"
    />
  )
}
