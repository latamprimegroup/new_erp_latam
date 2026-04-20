'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Headphones, Loader2, X } from 'lucide-react'
import { ClienteWelcomeOnboarding } from '@/components/cliente/ClienteWelcomeOnboarding'

type Incident = {
  active: boolean
  title: string
  body: string
  videoUrl?: string
}

export function ClienteAreaShell({ children }: { children: React.ReactNode }) {
  const [welcomeDim, setWelcomeDim] = useState(false)
  const [incident, setIncident] = useState<Incident | null>(null)
  const [conciergeOpen, setConciergeOpen] = useState(false)
  const [conciergeKind, setConciergeKind] = useState<'infra' | 'contingencia' | 'estrategia' | null>(null)
  const [conciergeMsg, setConciergeMsg] = useState('')
  const [conciergeBusy, setConciergeBusy] = useState(false)

  const loadBanner = useCallback(() => {
    fetch('/api/cliente/security-banner')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.incident?.active) setIncident(j.incident)
        else setIncident(null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadBanner()
    const t = setInterval(loadBanner, 120000)
    return () => clearInterval(t)
  }, [loadBanner])

  async function submitConcierge() {
    if (!conciergeKind) return
    setConciergeBusy(true)
    try {
      const r = await fetch('/api/cliente/war-room-live/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: conciergeKind, message: conciergeMsg.trim() || undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      setConciergeOpen(false)
      setConciergeKind(null)
      setConciergeMsg('')
      const extra = j.directLink ? `\n\nLink directo: ${j.directLink}` : ''
      alert(`Ticket ${j.ticketNumber} criado com prioridade URGENTE.${extra}`)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro')
    } finally {
      setConciergeBusy(false)
    }
  }

  return (
    <>
      {incident?.active && (
        <div className="sticky top-0 z-[60] border-b border-red-200 bg-red-950 text-red-50 px-4 py-3 shadow-lg">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-start gap-3">
            <AlertTriangle className="w-6 h-6 shrink-0 text-red-200 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm sm:text-base">{incident.title}</p>
              <p className="text-xs sm:text-sm text-red-100/90 mt-1 whitespace-pre-wrap">{incident.body}</p>
              {incident.videoUrl && (
                <a
                  href={incident.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-xs font-semibold underline text-white"
                >
                  Ver vídeo de instruções
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={`transition-opacity duration-700 ease-out ${welcomeDim ? 'opacity-[0.2] pointer-events-none select-none' : 'opacity-100'}`}
      >
        {children}
      </div>

      <ClienteWelcomeOnboarding onDimChange={setWelcomeDim} />

      <button
        type="button"
        onClick={() => {
          setConciergeOpen(true)
          setConciergeKind(null)
        }}
        className="fixed bottom-5 right-5 z-[55] flex items-center gap-2 rounded-full bg-primary-600 text-white px-4 py-3 shadow-lg hover:bg-primary-700 text-sm font-semibold"
        aria-label="Suporte VIP"
      >
        <Headphones className="w-5 h-5" />
        Suporte VIP
      </button>

      {conciergeOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/50"
          onClick={() => !conciergeBusy && setConciergeOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-gray-900 dark:text-white">Concierge 1-on-1</h2>
              <button type="button" className="p-1" onClick={() => !conciergeBusy && setConciergeOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Escolhe o tipo de pedido. Criamos um ticket URGENTE e, se existir link configurado, podes abrir WhatsApp/Cal
              directo.
            </p>
            <div className="grid gap-2">
              {(
                [
                  ['infra', 'Erro técnico / Infra (Gerson)'],
                  ['contingencia', 'Conta, contingência, proxy (Gustavo/Francielle)'],
                  ['estrategia', 'Estratégia / análise (Tiago)'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setConciergeKind(k)}
                  className={`text-left rounded-lg border px-3 py-2 text-sm ${
                    conciergeKind === k
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/40'
                      : 'border-gray-200 dark:border-white/15'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={conciergeMsg}
              onChange={(e) => setConciergeMsg(e.target.value)}
              placeholder="Contexto rápido (opcional)"
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
            />
            <button
              type="button"
              disabled={!conciergeKind || conciergeBusy}
              onClick={submitConcierge}
              className="w-full rounded-lg bg-primary-600 text-white py-2 text-sm font-medium disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {conciergeBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              Enviar pedido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
