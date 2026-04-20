'use client'

import { useEffect, useState } from 'react'

/**
 * Injeta HTML do rodapé (admin). Scripts são re-inseridos via DOM para executar (React não executa script em innerHTML).
 */
export function FooterCustomScripts() {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/config/public', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        const h = d?.footerCustomScripts
        if (typeof h === 'string' && h.trim()) setHtml(h)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (!html) return
    const container = document.getElementById('footer-custom-scripts-host')
    if (!container) return
    container.innerHTML = ''
    const tpl = document.createElement('template')
    tpl.innerHTML = html
    tpl.content.childNodes.forEach((node) => {
      if (node.nodeName === 'SCRIPT') {
        const os = node as HTMLScriptElement
        const s = document.createElement('script')
        if (os.src) {
          s.src = os.src
          s.async = os.async
        } else {
          s.textContent = os.textContent
        }
        document.body.appendChild(s)
      } else {
        container.appendChild(node.cloneNode(true))
      }
    })
  }, [html])

  return <div id="footer-custom-scripts-host" className="hidden" aria-hidden />
}
