'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

type Row = {
  id: string
  status: string
  iterationNumber: number
  checkoutUrl: string
  hookNotes: string | null
  logoUrl: string | null
  deliverableUrl: string | null
  uniqueMetadataHashDone: boolean
  ctrSnapshotAtDelivery: number | null
  clientEmail: string
  templateTitle: string
  templateNiche: string
  ticketNumber: string | null
}

const STATUSES = ['FILA', 'PRODUCAO', 'REVISAO', 'ENTREGUE'] as const

export function CreativeVaultAdminClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(() => {
    setErr(null)
    fetch('/api/admin/creative-vault/jobs')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<{ jobs: Row[] }>
      })
      .then((j) => setRows(j.jobs))
      .catch(() => setErr('Não foi possível carregar a fila.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function savePatch(
    id: string,
    patch: {
      status?: string
      deliverableUrl?: string | null
      uniqueMetadataHashDone?: boolean
      ctrSnapshotAtDelivery?: number | null
    }
  ) {
    setSaving(id)
    try {
      const r = await fetch(`/api/admin/creative-vault/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(null)
    }
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-16 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Creative Vault — fila de edição</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Atualize status, URL de entrega, Unique Hash e CTR na entrega (para o histórico do mentorado).
          </p>
        </div>
        <Link href="/dashboard/admin/tickets" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
          Tickets &amp; OS
        </Link>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-white/5 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Criativo</th>
              <th className="px-3 py-2">v</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Entrega URL</th>
              <th className="px-3 py-2">Unique Hash</th>
              <th className="px-3 py-2">CTR %</th>
              <th className="px-3 py-2">Ticket</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {rows.map((row) => (
              <JobAdminRow key={row.id} row={row} saving={saving === row.id} onSave={savePatch} statuses={STATUSES} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading && <p className="p-4 text-sm text-gray-500">Nenhum pedido.</p>}
      </div>
    </div>
  )
}

function JobAdminRow({
  row,
  saving,
  onSave,
  statuses,
}: {
  row: Row
  saving: boolean
  onSave: (id: string, p: Record<string, unknown>) => void
  statuses: readonly string[]
}) {
  const [status, setStatus] = useState(row.status)
  const [url, setUrl] = useState(row.deliverableUrl || '')
  const [hash, setHash] = useState(row.uniqueMetadataHashDone)
  const [ctr, setCtr] = useState(row.ctrSnapshotAtDelivery != null ? String(row.ctrSnapshotAtDelivery) : '')

  return (
    <tr className="dark:text-gray-200 align-top">
      <td className="px-3 py-2 text-xs max-w-[140px] break-all">{row.clientEmail}</td>
      <td className="px-3 py-2 text-xs">
        <div className="font-medium">{row.templateTitle}</div>
        <div className="text-gray-500">{row.templateNiche}</div>
        {row.logoUrl && (
          <a href={row.logoUrl} target="_blank" rel="noreferrer" className="text-primary-600 underline text-[11px]">
            Logo
          </a>
        )}
      </td>
      <td className="px-3 py-2">{row.iterationNumber}</td>
      <td className="px-3 py-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 text-xs px-2 py-1 max-w-[120px]"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 min-w-[180px]">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 text-xs px-2 py-1"
        />
      </td>
      <td className="px-3 py-2">
        <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={hash} onChange={(e) => setHash(e.target.checked)} />
          OK
        </label>
      </td>
      <td className="px-3 py-2 w-24">
        <input
          value={ctr}
          onChange={(e) => setCtr(e.target.value)}
          placeholder="%"
          className="w-full rounded border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 text-xs px-2 py-1"
        />
      </td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">{row.ticketNumber || '—'}</td>
      <td className="px-3 py-2">
        <button
          type="button"
          disabled={saving}
          className="rounded-lg bg-primary-600 text-white text-xs px-3 py-1.5 disabled:opacity-50"
          onClick={() =>
            onSave(row.id, {
              status,
              deliverableUrl: url.trim() || null,
              uniqueMetadataHashDone: hash,
              ctrSnapshotAtDelivery: ctr.trim() === '' ? null : Number(ctr.replace(',', '.')),
            })
          }
        >
          {saving ? '…' : 'Guardar'}
        </button>
      </td>
    </tr>
  )
}
