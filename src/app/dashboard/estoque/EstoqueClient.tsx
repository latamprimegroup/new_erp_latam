'use client'

import { useState, useEffect, useRef } from 'react'
import { SkeletonTable } from '@/components/Skeleton'

const PLATFORMS = [
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'KWAI_ADS', label: 'Kwai Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
  { value: 'OTHER', label: 'Outro' },
]

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponível',
  IN_USE: 'Em uso',
  CRITICAL: 'Crítico',
  DELIVERED: 'Entregue',
}

type Account = {
  id: string
  platform: string
  type: string
  archivedAt?: string | null
  source?: string
  yearStarted: number | null
  niche: string | null
  minConsumed: { toString: () => string } | null
  limitUsage: { toString: () => string } | null
  spent: { toString: () => string } | null
  status: string
  margin: { toString: () => string } | null
  salePrice: { toString: () => string } | null
  createdAt: string
  manager: { user: { name: string | null } } | null
  isPlugPlay?: boolean
}

function diasEmEstoque(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function EstoqueClient() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [criticalCount, setCriticalCount] = useState(0)
  const [byStatus, setByStatus] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterArchived, setFilterArchived] = useState(false) // false = disponíveis para venda
  const [filterPlugPlay, setFilterPlugPlay] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterType) params.set('type', filterType)
    if (filterStatus) params.set('status', filterStatus)
    if (filterPlatform) params.set('platform', filterPlatform)
    if (filterPlugPlay) params.set('plugPlayOnly', 'true')
    params.set('archived', String(filterArchived))
    fetch(`/api/estoque?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts || [])
        setCriticalCount(data.criticalCount || 0)
        setByStatus(data.byStatus || {})
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [filterType, filterStatus, filterPlatform, filterArchived, filterPlugPlay])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('format', file.name.endsWith('.json') ? 'json' : 'csv')
      const res = await fetch('/api/estoque/archive/upload', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (res.ok) {
        alert(`Importado: ${data.imported}. Falhas: ${data.failed}. Duplicados: ${data.duplicate}`)
        load()
      } else {
        alert(data.error || 'Erro no upload')
      }
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleExport(format: 'csv' | 'json') {
    setExporting(true)
    try {
      const params = new URLSearchParams({ format, includeArchived: String(filterArchived) })
      if (filterPlatform) params.set('platform', filterPlatform)
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/estoque/archive/export?${params}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `estoque-export-${new Date().toISOString().slice(0, 10)}.${format === 'csv' ? 'csv' : 'json'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  async function toggleArchive(account: Account) {
    const action = account.archivedAt ? 'unarchive' : 'archive'
    setArchivingId(account.id)
    try {
      const res = await fetch(`/api/estoque/${account.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) load()
      else {
        const data = await res.json()
        alert(data.error || 'Erro')
      }
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="heading-1">Estoque de Contas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.json"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-slate-700 text-white px-3 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {uploading ? 'Enviando...' : 'Upload CSV/JSON'}
          </button>
          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Exportar JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {criticalCount > 0 && !filterArchived && (
        <div className="card mb-6 bg-red-50 border-red-200">
          <p className="text-red-800 font-medium">
            ⚠️ {criticalCount} conta(s) em situação crítica
          </p>
        </div>
      )}

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">Distribuição por status</h2>
        <div className="flex flex-wrap gap-4">
          {Object.entries(byStatus).map(([status, count]) => (
            <div key={status} className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{STATUS_LABELS[status] || status}:</span>
              <span className="font-semibold">{count}</span>
            </div>
          ))}
          {Object.keys(byStatus).length === 0 && !loading && (
            <p className="text-gray-500 text-sm">Nenhum dado</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-4">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-200 bg-slate-50 text-sm">
            <input
              type="checkbox"
              checked={filterArchived}
              onChange={(e) => setFilterArchived(e.target.checked)}
            />
            Ver arquivadas (vault)
          </label>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 text-sm">
            <input
              type="checkbox"
              checked={filterPlugPlay}
              onChange={(e) => setFilterPlugPlay(e.target.checked)}
            />
            Apenas Plug & Play
          </label>
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="input-field py-1.5 px-2 w-40 text-sm"
          >
            <option value="">Plataforma</option>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field py-1.5 px-2 w-40 text-sm"
          >
            <option value="">Status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="text"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            placeholder="Tipo"
            className="input-field py-1.5 px-2 w-32 text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} />
          ) : accounts.length === 0 ? (
            <p className="text-gray-400 py-4">Nenhuma conta em estoque.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Plataforma</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Entrada</th>
                  <th className="pb-2 pr-4">Dias</th>
                  <th className="pb-2 pr-4">Ano</th>
                  <th className="pb-2 pr-4">Consumo</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Preço</th>
                  <th className="pb-2 pr-4">Gestor</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-b border-gray-100 last:border-0 ${
                      a.status === 'CRITICAL' ? 'bg-red-50/50' : ''
                    }`}
                  >
                    <td className="py-3 pr-4 font-mono text-xs">{a.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4">{PLATFORMS.find((p) => p.value === a.platform)?.label || a.platform}</td>
                    <td className="py-3 pr-4">
                      <span className="mr-1">{a.type}</span>
                      {a.isPlugPlay && (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                          [PLUG & PLAY]
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs">{a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="py-3 pr-4">{a.createdAt ? diasEmEstoque(a.createdAt) : '—'}</td>
                    <td className="py-3 pr-4">{a.yearStarted ?? '—'}</td>
                    <td className="py-3 pr-4">{a.minConsumed ? `R$ ${Number(a.minConsumed).toLocaleString()}` : '—'}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          a.status === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                          a.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100'
                        }`}
                      >
                        {STATUS_LABELS[a.status] || a.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{a.salePrice ? `R$ ${Number(a.salePrice).toLocaleString()}` : '—'}</td>
                    <td className="py-3 pr-4">{a.manager?.user?.name ?? '—'}</td>
                    <td className="py-3">
                      {a.status !== 'DELIVERED' && (
                        <button
                          onClick={() => toggleArchive(a)}
                          disabled={archivingId === a.id}
                          className={`text-xs px-2 py-1 rounded ${
                            a.archivedAt
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          } disabled:opacity-50`}
                        >
                          {archivingId === a.id ? '...' : a.archivedAt ? 'Desarquivar' : 'Arquivar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
