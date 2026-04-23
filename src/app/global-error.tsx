'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[War Room OS] Erro crítico global:', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, background: '#09090b', fontFamily: 'sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>

            {/* Ícone */}
            <div
              style={{
                width: 80, height: 80,
                borderRadius: 20,
                background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
                fontSize: 40,
              }}
            >
              🛰️
            </div>

            <p style={{ fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: '#f87171', marginBottom: 4 }}>
              Ads Ativos · War Room OS
            </p>

            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '12px 0 8px' }}>
              Erro crítico do sistema
            </h1>
            <p style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              O sistema encontrou um problema grave e precisa reiniciar.
              Seus dados estão protegidos.
            </p>

            {error.message && (
              <p
                style={{
                  fontSize: 11, color: '#52525b', fontFamily: 'monospace',
                  background: '#18181b', borderRadius: 8, padding: '8px 16px',
                  border: '1px solid #27272a', wordBreak: 'break-all',
                  marginBottom: 24,
                }}
              >
                {error.digest ? `[${error.digest}] ` : ''}{error.message}
              </p>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={reset}
                style={{
                  padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 14,
                }}
              >
                🔄 Reiniciar
              </button>
              <a
                href="/login"
                style={{
                  padding: '12px 24px', borderRadius: 12, textDecoration: 'none',
                  background: '#27272a', color: '#d4d4d8', fontWeight: 700, fontSize: 14,
                  border: '1px solid #3f3f46',
                }}
              >
                🔐 Ir ao Login
              </a>
            </div>

            <p style={{ marginTop: 24, fontSize: 10, color: '#3f3f46' }}>
              Pressione Ctrl + Shift + R para forçar o recarregamento completo
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}
