'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

type PrefRow = {
  id: string
  status: string
  campaignUrl: string
  clientEmail: string
  ticketNumber: string | null
  checklistJson: unknown
  analystNotes: string | null
}

export function WarRoomLiveAdminClient() {
  const [liveRaw, setLiveRaw] = useState('')
  const [concRaw, setConcRaw] = useState('')
  const [secRaw, setSecRaw] = useState('')
  const [preflights, setPreflights] = useState<PrefRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editCheck, setEditCheck] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/war-room-live/config').then((r) => r.json()),
      fetch('/api/admin/war-room-live/security-incident').then((r) => r.json()),
      fetch('/api/admin/war-room-live/preflight').then((r) => r.json()),
    ])
      .then(([cfg, sec, pref]) => {
        setLiveRaw(cfg.liveConfigRaw || JSON.stringify(cfg.liveConfig, null, 2))
        setConcRaw(cfg.conciergeLinksRaw || JSON.stringify(cfg.conciergeLinks, null, 2))
        setSecRaw(sec.raw || '')
        setPreflights(pref.items || [])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveConfig() {
    setSaving(true)
    try {
      const liveConfig = JSON.parse(liveRaw)
      const conciergeLinks = JSON.parse(concRaw)
      const r = await fetch('/api/admin/war-room-live/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liveConfig, conciergeLinks }),
      })
      if (!r.ok) throw new Error('Erro')
      alert('Configuração guardada')
      load()
    } catch {
      alert('JSON inválido ou erro ao guardar')
    } finally {
      setSaving(false)
    }
  }

  async function saveSecurity() {
    setSaving(true)
    try {
      const j = JSON.parse(secRaw)
      const r = await fetch('/api/admin/war-room-live/security-incident', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(j),
      })
      if (!r.ok) throw new Error('Erro')
      alert('Incidente atualizado — banner reflete em ~2 min nos mentorados')
      load()
    } catch {
      alert('JSON inválido')
    } finally {
      setSaving(false)
    }
  }

  async function patchPreflight(id: string, body: object) {
    const r = await fetch(`/api/admin/war-room-live/preflight/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) alert('Erro ao atualizar')
    else load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">War Room Live — admin</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Live (YouTube/Zoom), links Concierge, incidente global e pré-flights.
          </p>
        </div>
        <Link href="/dashboard/admin/tickets" className="text-sm text-primary-600 underline">
          Tickets
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Live + cronograma (JSON)</h2>
        <textarea
          value={liveRaw}
          onChange={(e) => setLiveRaw(e.target.value)}
          rows={14}
          className="w-full font-mono text-xs rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 p-3"
        />
        <h2 className="font-semibold pt-4">Links Concierge (JSON)</h2>
        <p className="text-xs text-gray-500">
          Chaves: <code>infra</code>, <code>contingencia</code>, <code>estrategia</code> — URLs (WhatsApp, Cal.com, etc.)
        </p>
        <textarea
          value={concRaw}
          onChange={(e) => setConcRaw(e.target.value)}
          rows={6}
          className="w-full font-mono text-xs rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 p-3"
        />
        <button
          type="button"
          disabled={saving}
          onClick={saveConfig}
          className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          Guardar config + concierge
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Incidente de segurança (banner global mentorados)</h2>
        <p className="text-xs text-gray-500">
          Ex.: <code>{`{"active":true,"title":"...","body":"...","videoUrl":"https://..."}`}</code> —{' '}
          <code>active:false</code> desliga.
        </p>
        <textarea
          value={secRaw}
          onChange={(e) => setSecRaw(e.target.value)}
          rows={8}
          className="w-full font-mono text-xs rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 p-3"
        />
        <button
          type="button"
          disabled={saving}
          onClick={saveSecurity}
          className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          Aplicar banner
        </button>
      </section>

      <section>
        <h2 className="font-semibold mb-3">Pré-flights</h2>
        <div className="space-y-4">
          {preflights.map((p) => (
            <div key={p.id} className="rounded-lg border border-gray-200 dark:border-white/10 p-4 text-sm space-y-2">
              <p className="text-xs text-gray-500">
                {p.clientEmail} · {p.ticketNumber} · {p.status}
              </p>
              <p className="font-mono text-xs break-all">{p.campaignUrl}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs border rounded px-2 py-1"
                  onClick={() => patchPreflight(p.id, { status: 'IN_ANALYSIS' })}
                >
                  Marcar em análise
                </button>
                <button
                  type="button"
                  className="text-xs border rounded px-2 py-1"
                  onClick={() => {
                    const sample = [
                      { id: 'creative', label: 'Criativo', status: 'ok' },
                      { id: 'shield', label: 'Blindagem / tracker', status: 'ok' },
                      { id: 'headline', label: 'Headline', status: 'adjust' },
                    ]
                    patchPreflight(p.id, { checklistJson: sample, status: 'COMPLETED' })
                  }}
                >
                  Checklist exemplo (OK/OK/Ajustar)
                </button>
              </div>
              <textarea
                value={editCheck[p.id] ?? (typeof p.analystNotes === 'string' ? p.analystNotes : '')}
                onChange={(e) => setEditCheck((c) => ({ ...c, [p.id]: e.target.value }))}
                placeholder="Notas do analista"
                rows={2}
                className="w-full text-xs rounded border border-gray-200 dark:border-white/15 p-2 bg-white dark:bg-black/20"
              />
              <button
                type="button"
                className="text-xs text-primary-600 underline"
                onClick={() => patchPreflight(p.id, { analystNotes: editCheck[p.id] ?? '' })}
              >
                Guardar notas
              </button>
            </div>
          ))}
          {preflights.length === 0 && <p className="text-gray-500 text-sm">Nenhum pré-flight.</p>}
        </div>
      </section>
    </div>
  )
}
