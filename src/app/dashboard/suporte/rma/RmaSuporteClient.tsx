'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, MessageSquare, RefreshCw } from 'lucide-react'

type Item = {
  id: string
  status: string
  reason: string
  openedAt: string
  resolvedAt: string | null
  resolutionMinutes: number | null
  reasonDetail: string | null
  additionalComments: string | null
  evidenceUrls: unknown
  originalAccount: {
    id: string
    googleAdsCustomerId: string | null
    platform: string
  }
  replacementAccount: { id: string; googleAdsCustomerId: string | null } | null
  client: { user: { name: string | null; email: string | null } }
  assignedTo: { id: string; name: string | null; email: string | null } | null
}

type Msg = {
  id: string
  body: string
  internalOnly: boolean
  createdAt: string
  user: { name: string | null; email: string | null; role: string }
}

function elapsedMinutes(openedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60_000))
}

export function RmaSuporteClient() {
  const searchParams = useSearchParams()
  const highlight = searchParams.get('highlight')

  const [data, setData] = useState<{
    items: Item[]
    topReasons: { label: string; count: number; percent: number }[]
    openCount: number
    labels: { reasons: Record<string, string>; statuses: Record<string, string> }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Item | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [msgBody, setMsgBody] = useState('')
  const [internalOnly, setInternalOnly] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const [patching, setPatching] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/rma')
      .then((r) => r.json())
      .then((d) =>
        setData({
          items: Array.isArray(d.items) ? d.items : [],
          topReasons: Array.isArray(d.topReasons) ? d.topReasons : [],
          openCount: typeof d.openCount === 'number' ? d.openCount : 0,
          labels: d.labels || { reasons: {}, statuses: {} },
        })
      )
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!selected) {
      setMessages([])
      return
    }
    setMsgLoading(true)
    fetch(`/api/admin/rma/${selected.id}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(Array.isArray(d.messages) ? d.messages : []))
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false))
  }, [selected])

  useEffect(() => {
    if (!highlight || !data?.items.length) return
    const found = data.items.find((i) => i.id === highlight)
    if (found) setSelected(found)
  }, [highlight, data])

  const evidenceUrls = useMemo(() => {
    const j = selected?.evidenceUrls
    if (!j) return []
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  }, [selected])

  async function patch(partial: Record<string, unknown>) {
    if (!selected) return
    setPatching(true)
    try {
      const res = await fetch(`/api/admin/rma/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert((err as { error?: string }).error || 'Erro ao guardar')
        return
      }
      const row = await res.json()
      setSelected(row)
      load()
    } finally {
      setPatching(false)
    }
  }

  async function sendStaffMessage() {
    if (!selected || !msgBody.trim()) return
    const res = await fetch(`/api/admin/rma/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: msgBody.trim(), internalOnly }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert((err as { error?: string }).error || 'Erro')
      return
    }
    setMsgBody('')
    setInternalOnly(false)
    const d = await fetch(`/api/admin/rma/${selected.id}/messages`).then((r) => r.json())
    setMessages(Array.isArray(d.messages) ? d.messages : [])
  }

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" /> A carregar fila RMA…
      </div>
    )
  }

  const { items, topReasons, openCount, labels } = data

  return (
    <div className="space-y-8 text-zinc-200">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
        <span className="text-sm text-zinc-500">
          Em aberto: <strong className="text-amber-300">{openCount}</strong>
        </span>
      </div>

      {topReasons.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h2 className="text-sm font-semibold text-white mb-3">Top motivos (amostra global)</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {topReasons.map((t, i) => (
              <div key={i} className="rounded-lg bg-zinc-900/80 px-3 py-2">
                <p className="text-xs text-zinc-500">{t.label}</p>
                <p className="text-lg font-bold text-white">
                  {t.percent}% <span className="text-sm font-normal text-zinc-400">({t.count})</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800 bg-zinc-950">
                <th className="p-3">Cliente / Conta</th>
                <th className="p-3">Estado</th>
                <th className="p-3">SLA</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const sla = r.resolvedAt
                  ? r.resolutionMinutes != null
                    ? `${r.resolutionMinutes} min (total)`
                    : '—'
                  : `${elapsedMinutes(r.openedAt)} min`
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-zinc-800/80 cursor-pointer hover:bg-zinc-900/50 ${
                      selected?.id === r.id ? 'bg-violet-950/30' : ''
                    }`}
                    onClick={() => setSelected(r)}
                  >
                    <td className="p-3 align-top">
                      <p className="font-medium text-white text-xs font-mono">{r.id.slice(0, 10)}</p>
                      <p className="text-zinc-400">{r.client.user?.name || r.client.user?.email}</p>
                      <p className="text-sky-300/90 text-xs mt-1">
                        {r.originalAccount.googleAdsCustomerId || r.originalAccount.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="p-3 align-top">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          r.status === 'CONCLUIDO'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : r.status === 'NEGADO_TERMO'
                              ? 'bg-red-500/20 text-red-300'
                              : r.status === 'EM_REPOSICAO'
                                ? 'bg-violet-500/20 text-violet-200'
                                : 'bg-amber-500/20 text-amber-200'
                        }`}
                      >
                        {labels.statuses?.[r.status] || r.status}
                      </span>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {labels.reasons?.[r.reason] || r.reason}
                      </p>
                    </td>
                    <td className="p-3 align-top text-xs text-zinc-400 tabular-nums">{sla}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {items.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">Nenhuma solicitação.</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-4 min-h-[320px]">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">Detalhe</h3>
                  <p className="text-xs text-zinc-500 font-mono">{selected.id}</p>
                </div>
                <MessageSquare className="h-5 w-5 text-zinc-600" />
              </div>

              <div className="text-sm space-y-2">
                <p>
                  <span className="text-zinc-500">Motivo:</span>{' '}
                  {labels.reasons?.[selected.reason] || selected.reason}
                </p>
                {selected.reasonDetail ? (
                  <p className="text-zinc-300 whitespace-pre-wrap">{selected.reasonDetail}</p>
                ) : null}
                {selected.additionalComments ? (
                  <p className="text-xs text-zinc-500 whitespace-pre-wrap">
                    Comentários: {selected.additionalComments}
                  </p>
                ) : null}
              </div>

              {evidenceUrls.length > 0 ? (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Evidências</p>
                  <div className="flex flex-wrap gap-2">
                    {evidenceUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-violet-400 hover:underline"
                      >
                        Abrir
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 items-center">
                <label className="text-xs text-zinc-500">Estado</label>
                <select
                  value={selected.status}
                  disabled={patching}
                  onChange={(e) => patch({ status: e.target.value })}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                >
                  {Object.entries(labels.statuses || {}).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <p className="text-xs font-semibold text-zinc-400 mb-2">Mensagens</p>
                {msgLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto mb-3">
                    {messages.map((m) => (
                      <li
                        key={m.id}
                        className={`rounded px-2 py-1.5 text-xs ${
                          m.internalOnly ? 'bg-amber-950/40 text-amber-100/90' : 'bg-zinc-900'
                        }`}
                      >
                        <span className="text-zinc-500">
                          {m.user.name || m.user.email} · {new Date(m.createdAt).toLocaleString('pt-BR')}
                          {m.internalOnly ? ' · interno' : ''}
                        </span>
                        <p className="text-zinc-200 whitespace-pre-wrap mt-0.5">{m.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm mb-2"
                  placeholder="Mensagem ao cliente…"
                />
                <label className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  <input
                    type="checkbox"
                    checked={internalOnly}
                    onChange={(e) => setInternalOnly(e.target.checked)}
                  />
                  Nota interna (não visível ao cliente)
                </label>
                <button
                  type="button"
                  onClick={sendStaffMessage}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white"
                >
                  Enviar
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Selecione uma linha para ver detalhe e mensagens.</p>
          )}
        </div>
      </div>
    </div>
  )
}
