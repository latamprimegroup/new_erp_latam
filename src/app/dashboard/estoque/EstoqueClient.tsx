'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { SkeletonTable } from '@/components/Skeleton'
import { InventoryEnginePanel } from '@/components/estoque/InventoryEnginePanel'

const PLATFORMS = [
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'KWAI_ADS', label: 'Kwai Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
  { value: 'OTHER', label: 'Outro' },
]

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  AVAILABLE: 'Disponível',
  IN_USE: 'Em uso',
  CRITICAL: 'Crítico',
  DELIVERED: 'Vendida',
}

const STATUS_CHART_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500',
  IN_USE: 'bg-sky-500',
  CRITICAL: 'bg-red-500',
  DELIVERED: 'bg-violet-500',
  PENDING: 'bg-amber-500',
  APPROVED: 'bg-teal-500',
  REJECTED: 'bg-gray-500',
}

const TYPE_LABELS: Record<string, string> = {
  G2: 'G2',
  CONTA_VERIFICADA_ANUNCIANTE: 'Verif. Anunciante',
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
  spentDisplayCurrency?: string | null
  spentDisplayAmount?: { toString: () => string } | null
  purchasePrice?: { toString: () => string } | null
  adsAtivosVerified?: boolean
  status: string
  margin: { toString: () => string } | null
  salePrice: { toString: () => string } | null
  createdAt: string
  manager: { user: { name: string | null } } | null
  isPlugPlay?: boolean
  g2Status?: 'PENDING' | 'APPROVED' | 'REJECTED'
  firstWhiteCampaign?: boolean
  approvalDate?: string | null
  saleOrderId?: string | null
}

type LowStockAlert = { platform: string; type: string; count: number; min: number }

function diasEmEstoque(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function diasDesde(dataIso: string | null | undefined): number | null {
  if (!dataIso) return null
  const diff = Date.now() - new Date(dataIso).getTime()
  if (Number.isNaN(diff)) return null
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function statusConicGradient(entries: [string, number][], total: number): string {
  let acc = 0
  const parts: string[] = []
  for (const [status, count] of entries) {
    const pct = (count / total) * 100
    const cls = STATUS_CHART_COLORS[status] || 'bg-gray-400'
    const colorMap: Record<string, string> = {
      'bg-emerald-500': '#10b981',
      'bg-sky-500': '#0ea5e9',
      'bg-red-500': '#ef4444',
      'bg-violet-500': '#8b5cf6',
      'bg-amber-500': '#f59e0b',
      'bg-teal-500': '#14b8a6',
      'bg-gray-500': '#6b7280',
      'bg-gray-400': '#9ca3af',
    }
    const hex = colorMap[cls] || '#9ca3af'
    const start = acc
    acc += pct
    parts.push(`${hex} ${start.toFixed(2)}% ${acc.toFixed(2)}%`)
  }
  return `conic-gradient(${parts.join(', ')})`
}

function StatusDistributionChart({
  byStatus,
}: {
  byStatus: Record<string, number>
}) {
  const entries = Object.entries(byStatus).filter(([, n]) => n > 0)
  const total = entries.reduce((s, [, n]) => s + n, 0)
  if (total === 0) {
    return <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhum dado</p>
  }
  const donutBg = statusConicGradient(entries, total)
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-6">
      <div
        className="relative shrink-0 w-28 h-28 rounded-full border-4 border-gray-200 dark:border-white/15 shadow-inner overflow-hidden"
        title="Distribuição proporcional por status"
        role="img"
        aria-label={`Distribuição: ${entries.map(([s, c]) => `${STATUS_LABELS[s] || s} ${c}`).join(', ')}`}
      >
        <div className="absolute inset-0 rounded-full" style={{ background: donutBg }} />
        <div className="absolute inset-[24%] rounded-full bg-white dark:bg-black border border-gray-100 dark:border-white/10" />
      </div>
      <div className="space-y-3 flex-1 min-w-0">
        <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-white/10">
          {entries.map(([status, count]) => (
            <div
              key={status}
              className={`${STATUS_CHART_COLORS[status] || 'bg-gray-400'} h-full transition-all`}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${STATUS_LABELS[status] || status}: ${count}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {entries.map(([status, count]) => (
            <div key={status} className="flex items-center gap-2">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_CHART_COLORS[status] || 'bg-gray-400'}`}
              />
              <span className="text-gray-600 dark:text-gray-300">
                {STATUS_LABELS[status] || status}: <strong>{count}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function EstoqueClient() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [criticalCount, setCriticalCount] = useState(0)
  const [byStatus, setByStatus] = useState<Record<string, number>>({})
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([])
  const [staleDaysThreshold, setStaleDaysThreshold] = useState(90)
  const [minAvailablePerSlice, setMinAvailablePerSlice] = useState(10)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterArchived, setFilterArchived] = useState(false)
  const [filterPlugPlay, setFilterPlugPlay] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkPlatform, setBulkPlatform] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [salesToday, setSalesToday] = useState(0)
  const [stockByPlatform, setStockByPlatform] = useState<Record<string, number>>({})
  const [payoutLoading, setPayoutLoading] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectableIds = useMemo(
    () => accounts.filter((a) => a.status !== 'DELIVERED').map((a) => a.id),
    [accounts]
  )

  const lowSliceKeys = useMemo(
    () => new Set(lowStockAlerts.map((x) => `${x.platform}|${x.type}`)),
    [lowStockAlerts]
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(() => {
    setLoading(true)
    setSelected(new Set())
    const params = new URLSearchParams()
    if (filterType) params.set('type', filterType)
    if (filterStatus) params.set('status', filterStatus)
    if (filterPlatform) params.set('platform', filterPlatform)
    if (filterPlugPlay) params.set('plugPlayOnly', 'true')
    if (debouncedSearch) params.set('q', debouncedSearch)
    params.set('archived', String(filterArchived))
    fetch(`/api/estoque?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts || [])
        setCriticalCount(data.criticalCount || 0)
        setByStatus(data.byStatus || {})
        setLowStockAlerts(data.lowStockAlerts || [])
        if (typeof data.staleDaysThreshold === 'number') setStaleDaysThreshold(data.staleDaysThreshold)
        if (typeof data.minAvailablePerSlice === 'number') setMinAvailablePerSlice(data.minAvailablePerSlice)
        if (typeof data.salesToday === 'number') setSalesToday(data.salesToday)
        if (data.stockByPlatform && typeof data.stockByPlatform === 'object') {
          setStockByPlatform(data.stockByPlatform as Record<string, number>)
        }
      })
      .finally(() => setLoading(false))
  }, [filterType, filterStatus, filterPlatform, filterArchived, filterPlugPlay, debouncedSearch])

  useEffect(() => {
    load()
  }, [load])

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(selectableIds))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyBulk() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!bulkStatus && !bulkPlatform) {
      alert('Escolha um novo status ou plataforma para aplicar em lote.')
      return
    }
    if (!confirm(`Aplicar alteração em ${ids.length} conta(s)? Contas entregues serão ignoradas.`)) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/estoque/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          ...(bulkStatus ? { status: bulkStatus } : {}),
          ...(bulkPlatform ? { platform: bulkPlatform } : {}),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(`Atualizadas: ${data.updated}. Ignoradas (entregues): ${data.skippedDelivered || 0}.`)
        setBulkStatus('')
        setBulkPlatform('')
        load()
      } else {
        alert(data.error || 'Erro na ação em massa')
      }
    } finally {
      setBulkBusy(false)
    }
  }

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
      if (debouncedSearch) params.set('q', debouncedSearch)
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

  function platformLabel(v: string) {
    return PLATFORMS.find((p) => p.value === v)?.label || v
  }

  function platformBadgeClass(platform: string): string {
    if (platform === 'META_ADS') return 'bg-blue-600/90 text-white'
    if (platform === 'GOOGLE_ADS')
      return 'bg-gradient-to-r from-blue-500 via-red-500 to-yellow-400 text-white'
    if (platform === 'TIKTOK_ADS') return 'bg-pink-600/90 text-white'
    if (platform === 'KWAI_ADS') return 'bg-orange-600/85 text-white'
    return 'bg-zinc-600 text-white'
  }

  async function openSupplierPayout(accountId: string) {
    setPayoutLoading(accountId)
    try {
      const res = await fetch(`/api/estoque/${encodeURIComponent(accountId)}/supplier-payout`)
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Erro')
        return
      }
      const msg = [
        `Fornecedor: ${data.supplierName || '—'}`,
        `Custo (pagar): R$ ${data.purchasePriceBrl != null ? Number(data.purchasePriceBrl).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}`,
        `PIX: ${data.pixKey || 'não cadastrado'}`,
        '',
        data.note,
      ].join('\n')
      alert(msg)
    } finally {
      setPayoutLoading(null)
    }
  }

  return (
    <div>
      <InventoryEnginePanel
        salesToday={salesToday}
        stockByPlatform={stockByPlatform}
        selectedIds={Array.from(selected)}
        onReload={load}
      />
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
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-slate-700 dark:bg-slate-600 text-white px-3 py-2 text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50"
          >
            {uploading ? 'Enviando...' : 'Upload CSV/JSON'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 text-gray-800 dark:text-gray-200"
          >
            Exportar JSON
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 text-gray-800 dark:text-gray-200"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {criticalCount > 0 && !filterArchived && (
        <div className="card mb-6 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50">
          <p className="text-red-800 dark:text-red-200 font-medium">
            {criticalCount} conta(s) em situação crítica nesta visão.
          </p>
        </div>
      )}

      {!filterArchived && lowStockAlerts.length > 0 && (
        <div className="card mb-6 border-red-300 dark:border-red-800/60 bg-red-50/90 dark:bg-red-950/25">
          <p className="font-semibold text-red-900 dark:text-red-100 mb-2">Estoque crítico por tipo</p>
          <p className="text-xs text-red-800/90 dark:text-red-200/90 mb-3">
            Disponíveis abaixo do mínimo ({minAvailablePerSlice}) por plataforma/tipo — ajuste em sistema:
            <code className="mx-1 text-[11px]">estoque_minimo_per_faixa</code> ou
            <code className="ml-1 text-[11px]">estoque_minimo</code>.
          </p>
          <ul className="text-sm text-red-900 dark:text-red-100 space-y-1">
            {lowStockAlerts.map((a) => (
              <li key={`${a.platform}-${a.type}`}>
                {platformLabel(a.platform)} · {TYPE_LABELS[a.type] || a.type}:{' '}
                <strong>{a.count}</strong> disponível(is) (mín. {a.min})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-6 dark:border-white/10">
        <h2 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">Distribuição por status</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Carregando...</p>
        ) : (
          <StatusDistributionChart byStatus={byStatus} />
        )}
      </div>

      <div className="card dark:border-white/10">
        <div className="flex flex-wrap gap-2 mb-4 items-end">
          <div className="flex flex-col gap-1 min-w-[180px] flex-1 max-w-xs">
            <label className="text-xs text-gray-500 dark:text-gray-400">Buscar</label>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ID, nicho, tipo, descrição…"
              className="input-field py-1.5 text-sm"
              autoComplete="off"
            />
          </div>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/5 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={filterArchived}
              onChange={(e) => setFilterArchived(e.target.checked)}
            />
            Ver arquivadas (vault)
          </label>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={filterPlugPlay}
              onChange={(e) => setFilterPlugPlay(e.target.checked)}
            />
            Apenas Contas Prontas (Plug & Play)
          </label>
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="input-field py-1.5 px-2 w-40 text-sm"
          >
            <option value="">Plataforma</option>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field py-1.5 px-2 w-44 text-sm"
          >
            <option value="">Status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-field py-1.5 px-2 w-44 text-sm"
          >
            <option value="">Tipo</option>
            <option value="G2">G2</option>
            <option value="CONTA_VERIFICADA_ANUNCIANTE">Verif. Anunciante</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="mb-4 p-3 rounded-lg border border-primary-500/40 bg-primary-50/50 dark:bg-primary-950/20 flex flex-wrap items-end gap-3">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {selected.size} selecionada(s)
            </span>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="input-field py-1.5 text-sm w-44"
            >
              <option value="">Status (lote)</option>
              {['AVAILABLE', 'IN_USE', 'CRITICAL', 'PENDING'].map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={bulkPlatform}
              onChange={(e) => setBulkPlatform(e.target.value)}
              className="input-field py-1.5 text-sm w-40"
            >
              <option value="">Plataforma (lote)</option>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={applyBulk}
              className="btn-primary text-sm py-1.5"
            >
              {bulkBusy ? 'Aplicando...' : 'Aplicar em lote'}
            </button>
            <button type="button" className="btn-secondary text-sm py-1.5" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={6} />
          ) : accounts.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 py-4">Nenhuma conta em estoque.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-white/10">
                  <th className="pb-2 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      title="Selecionar todas (exceto vendidas)"
                    />
                  </th>
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Plataforma</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Criação</th>
                  <th className="pb-2 pr-4">Dias</th>
                  <th className="pb-2 pr-4">Ano</th>
                  <th className="pb-2 pr-4">Consumo</th>
                  <th className="pb-2 pr-4">Spend (vit.)</th>
                  <th className="pb-2 pr-4">Custo</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Pedido</th>
                  <th className="pb-2 pr-4">Preço venda</th>
                  <th className="pb-2 pr-4">Gestor</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const dias = a.createdAt ? diasEmEstoque(a.createdAt) : null
                  const stale = dias != null && dias >= staleDaysThreshold && a.status === 'AVAILABLE'
                  const sliceLow =
                    !filterArchived &&
                    a.status === 'AVAILABLE' &&
                    lowSliceKeys.has(`${a.platform}|${a.type}`)
                  return (
                    <tr
                      key={a.id}
                      className={`border-b border-gray-100 dark:border-white/5 last:border-0 ${
                        a.status === 'CRITICAL' ? 'bg-red-50/50 dark:bg-red-950/15' : ''
                      } ${sliceLow ? 'border-l-4 border-l-red-500 pl-0' : ''}`}
                    >
                      <td className="py-3 pr-2">
                        {a.status !== 'DELIVERED' ? (
                          <input
                            type="checkbox"
                            checked={selected.has(a.id)}
                            onChange={() => toggleOne(a.id)}
                          />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-gray-800 dark:text-gray-200">
                        {a.id.slice(0, 8)}
                      </td>
                      <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${platformBadgeClass(a.platform)}`}
                        >
                          {platformLabel(a.platform)}
                        </span>
                        {a.adsAtivosVerified && (
                          <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] bg-cyan-950/50 text-cyan-300 border border-cyan-500/30">
                            Verificado AA
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">
                        <span className="mr-1">{TYPE_LABELS[a.type] || a.type}</span>
                        {a.isPlugPlay && (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                            [PLUG &amp; PLAY]
                          </span>
                        )}
                        {a.isPlugPlay && (
                          <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                            Conta G2 verificada + Campanha White aprovada. Pronta para troca de domínio/criativo.
                            {diasDesde(a.approvalDate) != null ? ` Maturando há ${diasDesde(a.approvalDate)} dia(s).` : ''}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-600 dark:text-gray-300">
                        {a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {dias != null ? (
                          <span
                            className={
                              stale
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-gray-800 dark:text-gray-200'
                            }
                            title={
                              stale
                                ? `Parada há ${dias} dias (alerta ≥ ${staleDaysThreshold}): risco de “esfriamento” do ativo`
                                : undefined
                            }
                          >
                            {dias}
                            {stale && ' ⚠'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">{a.yearStarted ?? '—'}</td>
                      <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">
                        {a.minConsumed ? `R$ ${Number(a.minConsumed).toLocaleString('pt-BR')}` : '—'}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-700 dark:text-gray-300">
                        {a.spentDisplayAmount != null && a.spentDisplayCurrency
                          ? `${Number(a.spentDisplayAmount).toLocaleString('pt-BR')} ${a.spentDisplayCurrency}`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-xs text-amber-800/90 dark:text-amber-200/90">
                        {a.purchasePrice != null
                          ? `R$ ${Number(a.purchasePrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            a.status === 'CRITICAL'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                              : a.status === 'AVAILABLE'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                : a.status === 'DELIVERED'
                                  ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                                  : 'bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {STATUS_LABELS[a.status] || a.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {a.saleOrderId ? (
                          <Link
                            href={`/dashboard/vendas?orderId=${encodeURIComponent(a.saleOrderId)}`}
                            className="text-primary-600 dark:text-primary-400 hover:underline text-xs inline-flex flex-col gap-0.5"
                            title="Abrir vendas com este pedido em destaque"
                          >
                            <span className="font-mono">{a.saleOrderId.slice(0, 8)}…</span>
                            <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
                              Ver pedido
                            </span>
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-800 dark:text-gray-200 font-medium">
                        {a.salePrice ? `R$ ${Number(a.salePrice).toLocaleString('pt-BR')}` : '—'}
                      </td>
                      <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">
                        {a.manager?.user?.name ?? '—'}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-col gap-1 items-start">
                          {a.status !== 'DELIVERED' && (
                            <button
                              type="button"
                              onClick={() => toggleArchive(a)}
                              disabled={archivingId === a.id}
                              className={`text-xs px-2 py-1 rounded ${
                                a.archivedAt
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200'
                                  : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-white/15'
                              } disabled:opacity-50`}
                            >
                              {archivingId === a.id ? '...' : a.archivedAt ? 'Desarquivar' : 'Arquivar'}
                            </button>
                          )}
                          {a.status === 'DELIVERED' && (
                            <button
                              type="button"
                              disabled={payoutLoading === a.id}
                              onClick={() => openSupplierPayout(a.id)}
                              className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 hover:opacity-90 disabled:opacity-50"
                            >
                              {payoutLoading === a.id ? '…' : 'PIX fornecedor'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
