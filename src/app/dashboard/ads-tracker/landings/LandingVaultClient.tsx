'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Copy,
  ExternalLink,
  Gauge,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wand2,
  ArrowRightLeft,
} from 'lucide-react'

type LandingRow = {
  id: string
  name: string
  primaryUrl: string
  secondaryUrl: string | null
  stack: string
  status: string
  lastProbeMsPrimary: number | null
  lastProbeMsSecondary: number | null
  lastProbeAt: string | null
  scriptHygieneNotes: string | null
  hygieneHintsLive: string
  conversionSnapshot: unknown
  opsNotes: string | null
  tokenCount: number
  updatedAt: string
}

const STACKS = ['HTML_PLAIN', 'WORDPRESS', 'ELEMENTOR', 'OTHER'] as const
const STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const

function snapPreview(v: unknown): string {
  if (v == null) return '—'
  try {
    return JSON.stringify(v).slice(0, 80) + (JSON.stringify(v).length > 80 ? '…' : '')
  } catch {
    return '—'
  }
}

export function LandingVaultClient() {
  const [rows, setRows] = useState<LandingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState<LandingRow | 'new' | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    fetch('/api/admin/landing-vault')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<{ landings: LandingRow[] }>
      })
      .then((j) => setRows(j.landings || []))
      .catch(() => setErr('Não foi possível carregar o cofre.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function probe(id: string) {
    await fetch(`/api/admin/landing-vault/${id}/probe`, { method: 'POST' })
    load()
  }

  async function cloneRow(id: string) {
    const r = await fetch(`/api/admin/landing-vault/${id}/clone`, { method: 'POST' })
    if (!r.ok) setErr('Clonar falhou.')
    else load()
  }

  async function delRow(id: string) {
    if (!confirm('Eliminar esta entrada do cofre?')) return
    const r = await fetch(`/api/admin/landing-vault/${id}`, { method: 'DELETE' })
    if (!r.ok) setErr('Eliminar falhou.')
    else load()
  }

  async function genToken(id: string) {
    const r = await fetch(`/api/admin/landing-vault/${id}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresInDays: 90 }),
    })
    const j = (await r.json()) as { redirectUrl?: string | null; token?: string; warning?: string | null }
    if (!r.ok) {
      setErr('Token falhou.')
      return
    }
    const text = j.redirectUrl || j.token || ''
    if (text) await navigator.clipboard.writeText(text).catch(() => {})
    alert(
      j.redirectUrl
        ? `Link copiado:\n${j.redirectUrl}`
        : `Token: ${j.token}\n${j.warning || 'Defina NEXT_PUBLIC_APP_URL para URL completa.'}`
    )
  }

  function openPreview(primary: string, secondary: string | null) {
    window.open(primary, '_blank', 'noopener,noreferrer')
    if (secondary?.trim()) {
      window.open(secondary, '_blank', 'noopener,noreferrer')
    }
  }

  async function migrateDomain(id: string, currentPrimary: string) {
    const next = prompt('Novo URL principal (https://…)', currentPrimary)
    if (!next || !next.trim()) return
    const note = prompt('Nota da migração (opcional)') || ''
    const r = await fetch(`/api/admin/landing-vault/${id}/migrate-domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPrimaryUrl: next.trim(), note: note.trim() || undefined }),
    })
    if (!r.ok) setErr('Migração falhou.')
    else load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => setModal('new')}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nova landing
        </button>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <p className="text-[11px] text-zinc-500 border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
        &quot;Pré-visualização&quot; abre os URLs públicos no navegador — não simula IP de auditoria nem user-agent de bot.
        Coluna de tempo = medição no servidor (aproximação), não LCP de campo real.
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/90">
        <table className="w-full text-xs min-w-[1100px]">
          <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="text-left p-2 w-36">Ações</th>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Nome</th>
              <th className="text-left p-2">Money (principal)</th>
              <th className="text-left p-2">Safe (secundário)</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Tempo HTTP (ms)</th>
              <th className="text-center p-2">Tokens</th>
              <th className="text-left p-2">Conversões (snapshot)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-zinc-500">
                  Sem landings. Crie a primeira entrada.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-900/40">
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <IconBtn title="Editar" onClick={() => setModal(r)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn
                      title="Pré-visualizar (abre URLs)"
                      onClick={() => openPreview(r.primaryUrl, r.secondaryUrl)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="Clonar" onClick={() => void cloneRow(r.id)}>
                      <Copy className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="Medir tempo HTTP" onClick={() => void probe(r.id)}>
                      <Gauge className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="Token de URL" onClick={() => void genToken(r.id)}>
                      <Wand2 className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="Migrar domínio (URL principal)" onClick={() => void migrateDomain(r.id, r.primaryUrl)}>
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </IconBtn>
                    <IconBtn title="Eliminar" onClick={() => void delRow(r.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    </IconBtn>
                  </div>
                </td>
                <td className="p-2 font-mono text-zinc-500 max-w-[90px] truncate" title={r.id}>
                  {r.id.slice(0, 10)}…
                </td>
                <td className="p-2 text-zinc-200 font-medium max-w-[140px] truncate" title={r.name}>
                  {r.name}
                </td>
                <td className="p-2 text-zinc-400 max-w-[200px] truncate font-mono" title={r.primaryUrl}>
                  {r.primaryUrl}
                </td>
                <td className="p-2 text-zinc-500 max-w-[200px] truncate font-mono" title={r.secondaryUrl || ''}>
                  {r.secondaryUrl || '—'}
                </td>
                <td className="p-2">
                  <span className="text-[10px] uppercase text-amber-200/90">{r.status}</span>
                  <div className="text-[10px] text-zinc-600">{r.stack}</div>
                </td>
                <td className="p-2 text-zinc-300 font-mono whitespace-nowrap">
                  {r.lastProbeMsPrimary != null ? `${r.lastProbeMsPrimary}` : '—'}
                  {r.secondaryUrl && (
                    <span className="text-zinc-600">
                      {' '}
                      / {r.lastProbeMsSecondary != null ? r.lastProbeMsSecondary : '—'}
                    </span>
                  )}
                </td>
                <td className="p-2 text-center text-zinc-400 font-mono">{r.tokenCount}</td>
                <td className="p-2 text-zinc-500 font-mono" title={snapPreview(r.conversionSnapshot)}>
                  {snapPreview(r.conversionSnapshot)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <EditModal
          initial={modal === 'new' ? null : modal}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={async (payload) => {
            setSaving(true)
            setErr(null)
            try {
              if (modal === 'new') {
                const res = await fetch('/api/admin/landing-vault', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                })
                if (!res.ok) throw new Error('create')
              } else if (typeof modal !== 'string') {
                const res = await fetch(`/api/admin/landing-vault/${modal.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                })
                if (!res.ok) throw new Error('patch')
              }
              setModal(null)
              load()
            } catch {
              setErr('Não foi possível guardar.')
            } finally {
              setSaving(false)
            }
          }}
        />
      )}
    </div>
  )
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
    >
      {children}
    </button>
  )
}

function EditModal({
  initial,
  saving,
  onClose,
  onSave,
}: {
  initial: LandingRow | null
  saving: boolean
  onClose: () => void
  onSave: (p: Record<string, unknown>) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name || '')
  const [primaryUrl, setPrimaryUrl] = useState(initial?.primaryUrl || '')
  const [secondaryUrl, setSecondaryUrl] = useState(initial?.secondaryUrl || '')
  const [stack, setStack] = useState(initial?.stack || 'HTML_PLAIN')
  const [status, setStatus] = useState(initial?.status || 'DRAFT')
  const [convJson, setConvJson] = useState(
    initial?.conversionSnapshot != null ? JSON.stringify(initial.conversionSnapshot, null, 2) : ''
  )
  const [opsNotes, setOpsNotes] = useState(initial?.opsNotes || '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white">{initial ? 'Editar landing' : 'Nova landing'}</h2>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-zinc-400">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-400">Money page — URL principal (https)</span>
            <input
              value={primaryUrl}
              onChange={(e) => setPrimaryUrl(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-400">
              Safe page — URL secundária (https){!initial ? ' *' : ''}
            </span>
            <input
              value={secondaryUrl}
              onChange={(e) => setSecondaryUrl(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-zinc-400 text-xs">Stack</span>
              <select
                value={stack}
                onChange={(e) => setStack(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white text-xs"
              >
                {STACKS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-zinc-400 text-xs">Estado</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white text-xs"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-zinc-400 text-xs">Snapshot conversões (JSON opcional)</span>
            <textarea
              value={convJson}
              onChange={(e) => setConvJson(e.target.value)}
              rows={3}
              placeholder='{"leads7d":0}'
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-400 text-xs">Notas operacionais</span>
            <input
              value={opsNotes}
              onChange={(e) => setOpsNotes(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white text-xs"
            />
          </label>
          {initial?.hygieneHintsLive && (
            <div className="text-[11px] text-amber-200/80 whitespace-pre-wrap border border-amber-900/40 rounded-lg p-2 bg-amber-950/20">
              {initial.hygieneHintsLive}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800">
            Cancelar
          </button>
          <button
            type="button"
            disabled={
              saving ||
              !name.trim() ||
              !primaryUrl.trim() ||
              (!initial && !secondaryUrl.trim())
            }
            onClick={() => {
              let conversionSnapshot: unknown = undefined
              if (convJson.trim()) {
                try {
                  conversionSnapshot = JSON.parse(convJson) as unknown
                } catch {
                  alert('JSON de conversões inválido.')
                  return
                }
              }
              if (!initial && !secondaryUrl.trim()) {
                alert('Indique a URL Safe (secundária).')
                return
              }
              void onSave({
                name: name.trim(),
                primaryUrl: primaryUrl.trim(),
                secondaryUrl: secondaryUrl.trim() || null,
                stack,
                status,
                conversionSnapshot,
                opsNotes: opsNotes.trim() || null,
              })
            }}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-40"
          >
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
