'use client'

import { useCallback, useEffect, useState } from 'react'
import { Brain, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react'

type Briefing = {
  summary:    string
  alerts:     { type: 'DANGER' | 'WARNING' | 'OK'; message: string }[]
  topTask?:   string
  esquecidos?: string[]
  revenue?:   number
  noAI?:      boolean
  fresh:      boolean
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function BriefingCard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [loading, setLoading]   = useState(true)
  const [open, setOpen]         = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/alfredo/briefing')
      if (r.ok) setBriefing(await r.json())
    } catch { /* silently ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 flex items-center gap-3 bg-white dark:bg-ads-dark-card">
      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
      <span className="text-sm text-zinc-500">ALFREDO IA preparando seu briefing matinal...</span>
    </div>
  )

  if (!briefing) return null

  const hasDanger  = briefing.alerts?.some((a) => a.type === 'DANGER')
  const hasWarning = briefing.alerts?.some((a) => a.type === 'WARNING')
  const colorClass = hasDanger
    ? 'border-red-300 bg-red-50 dark:bg-red-950/10'
    : hasWarning
    ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/10'
    : 'border-green-300 bg-green-50 dark:bg-green-950/10'

  return (
    <div className={`rounded-2xl border ${colorClass} overflow-hidden`}>
      <button onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:opacity-80 transition-opacity">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-500 uppercase">Briefing Matinal — ALFREDO IA</p>
          {briefing.topTask && (
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">🎯 {briefing.topTask}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {briefing.revenue != null && (
            <span className="hidden sm:block text-xs font-mono text-zinc-500">{BRL(Number(briefing.revenue))}</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); load() }}
            className="p-1 rounded hover:bg-white/50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{briefing.summary}</p>

          {briefing.alerts && briefing.alerts.length > 0 && (
            <div className="space-y-1.5">
              {briefing.alerts.map((a, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                  a.type === 'DANGER'  ? 'bg-red-100 text-red-700' :
                  a.type === 'WARNING' ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'}`}>
                  {a.type === 'DANGER' ? '🚨' : a.type === 'WARNING' ? '⚠️' : '✅'} {a.message}
                </div>
              ))}
            </div>
          )}

          {briefing.esquecidos && briefing.esquecidos.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/10 px-3 py-2">
              <p className="text-xs font-bold text-amber-700 mb-1">📌 Não Esquecer:</p>
              <ul className="space-y-0.5">
                {briefing.esquecidos.map((e, i) => (
                  <li key={i} className="text-xs text-amber-600">• {e}</li>
                ))}
              </ul>
            </div>
          )}

          {briefing.noAI && (
            <p className="text-xs text-zinc-400 italic">
              Configure <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">OPENAI_API_KEY</code> no .env.local para briefings gerados por IA.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
