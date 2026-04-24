'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, Plus, Loader2, RefreshCw, X, Check, Eye, EyeOff,
  ChevronRight, Package, Pencil, Trash2, Tag, User, AlertTriangle,
  TrendingUp, DollarSign, ShoppingBag, LayoutGrid, List, BadgeDollarSign,
  Store, Hash, ArrowUpRight,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Asset = {
  id: string; adsId: string; category: string; subCategory: string | null
  status: string; salePrice: number; displayName: string; description: string | null
  tags: string | null; createdAt: string
  vendorId?: string; costPrice?: number; vendorRef?: string
  vendor?: { name: string; category: string; rating: number }
  _count?: { movements: number }
}

type Summary = {
  availableCount:     number
  availableCostTotal: number
  availableSaleTotal: number
  availableMargin:    number
  availableMarginPct: number
  soldCount:          number
  soldRevenue:        number
}

type ByStatus = Record<string, number>

// ─── Constantes ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponível', QUARANTINE: 'Quarentena', SOLD: 'Vendido',
  AWAITING_VENDOR: 'Aguard. Fornec.', RECEIVED: 'Recebido',
  TRIAGEM: 'Em Triagem', DELIVERED: 'Entregue', DEAD: 'Baixado',
}
const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-700', QUARANTINE: 'bg-amber-100 text-amber-700',
  SOLD: 'bg-blue-100 text-blue-700', AWAITING_VENDOR: 'bg-orange-100 text-orange-700',
  RECEIVED: 'bg-teal-100 text-teal-700', TRIAGEM: 'bg-violet-100 text-violet-700',
  DELIVERED: 'bg-zinc-100 text-zinc-500', DEAD: 'bg-red-100 text-red-600',
}
const CATEGORY_COLORS: Record<string, string> = {
  CONTAS: 'bg-primary-100 text-primary-700', PERFIS: 'bg-violet-100 text-violet-700',
  BM: 'bg-blue-100 text-blue-700', PROXIES: 'bg-orange-100 text-orange-700',
  SOFTWARE: 'bg-green-100 text-green-700', INFRA: 'bg-zinc-100 text-zinc-600',
  HARDWARE: 'bg-rose-100 text-rose-700', OUTROS: 'bg-gray-100 text-gray-600',
}
const CATEGORY_BG: Record<string, string> = {
  CONTAS: 'from-primary-500 to-primary-700', PERFIS: 'from-violet-500 to-purple-700',
  BM: 'from-blue-500 to-indigo-700', PROXIES: 'from-orange-500 to-amber-700',
  SOFTWARE: 'from-green-500 to-emerald-700', INFRA: 'from-zinc-500 to-zinc-700',
  HARDWARE: 'from-rose-500 to-red-700', OUTROS: 'from-gray-500 to-gray-700',
}
const CATEGORIES = ['CONTAS', 'PERFIS', 'BM', 'PROXIES', 'SOFTWARE', 'INFRA', 'HARDWARE', 'OUTROS']
const STATUSES   = Object.keys(STATUS_LABEL)

const TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ['QUARANTINE', 'SOLD', 'DEAD'],
  QUARANTINE: ['AVAILABLE', 'DEAD'],
  SOLD: ['AWAITING_VENDOR'],
  AWAITING_VENDOR: ['RECEIVED'],
  RECEIVED: ['TRIAGEM'],
  TRIAGEM: ['DELIVERED', 'DEAD'],
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v: number) => `${v.toFixed(1)}%`

// ─── Componente principal ─────────────────────────────────────────────────────

export function EstoqueTab({ role }: { role: string }) {
  const isAdmin       = role === 'ADMIN' || role === 'PURCHASING'
  const isCommercial  = role === 'COMMERCIAL' || role === 'DELIVERER' || role === 'FINANCE'
  const canWrite      = isAdmin
  const canSell       = isAdmin || role === 'COMMERCIAL'
  const canSeeSensitive = isAdmin

  // ── Estado ──────────────────────────────────────────────────────────────────
  const [assets, setAssets]         = useState<Asset[]>([])
  const [byStatus, setByStatus]     = useState<ByStatus>({})
  const [summary, setSummary]       = useState<Summary | null>(null)
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [q, setQ]                   = useState('')
  const [filterCat, setCat]         = useState('')
  const [filterSt, setSt]           = useState(isCommercial ? 'AVAILABLE' : '')
  const [filterTag, setFilterTag]   = useState('')
  const [viewMode, setViewMode]     = useState<'table' | 'cards'>(isCommercial ? 'cards' : 'table')
  const [showRaw, setShowRaw]       = useState(false)
  const [selected, setSelected]     = useState<Asset | null>(null)
  const [flash, setFlash]           = useState<{ msg: string; ok: boolean } | null>(null)
  const [vendors, setVendors]       = useState<{ id: string; name: string }[]>([])

  // Novo ativo
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm] = useState({
    category: 'CONTAS', subCategory: '', vendorId: '', costPrice: '',
    salePrice: '', displayName: '', description: '', tags: '', vendorRef: '',
    // Campos War Room OS (armazenados em specs)
    year: '', paymentType: '', verificacao: false, docStatus: '',
  })

  // Atualiza salePrice via atalho de margem
  const applyMargin = (pct: number) => {
    const cost = parseFloat(form.costPrice)
    if (!cost || cost <= 0) return
    setForm((f) => ({ ...f, salePrice: (cost * (1 + pct / 100)).toFixed(2) }))
  }

  // Auto-tag CNH ao mudar docStatus
  const handleDocStatus = (val: string) => {
    setForm((f) => {
      const hasCnh = val === 'CNH Enviada' || val === 'CNH Validada'
      const tags = f.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t && t !== 'cnh-validada')
      if (hasCnh) tags.push('cnh-validada')
      return { ...f, docStatus: val, tags: tags.filter(Boolean).join(', ') }
    })
  }

  // Editar
  const [showEdit, setShowEdit]     = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    displayName: '', subCategory: '', salePrice: '', costPrice: '',
    description: '', tags: '', vendorRef: '',
  })

  // Excluir
  const [deleteTarget, setDeleteTarget]   = useState<Asset | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Venda (modal comprador)
  const [pendingStatus, setPendingStatus] = useState<{ id: string; newStatus: string } | null>(null)
  const [buyerName, setBuyerName]         = useState('')
  const [statusLoading, setStatusLoading] = useState<string | null>(null)

  // ── Carregar ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ limit: '100' })
    if (filterTag)    p.set('q', filterTag)
    else if (q)       p.set('q', q)
    if (filterCat)    p.set('category', filterCat)
    if (filterSt)     p.set('status', filterSt)
    const r = await fetch(`/api/compras/ativos?${p}`)
    if (r.ok) {
      const j = await r.json()
      setAssets(j.assets ?? [])
      setByStatus(j.byStatus ?? {})
      setTotal(j.total ?? 0)
      if (j.summary) setSummary(j.summary)
    }
    setLoading(false)
  }, [q, filterTag, filterCat, filterSt])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!canSeeSensitive) return
    fetch('/api/compras/fornecedores?limit=100')
      .then((r) => r.json())
      .then((j) => setVendors(j.vendors?.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })) ?? []))
  }, [canSeeSensitive])

  // ── Tags únicas dos ativos carregados ────────────────────────────────────────
  const allTags = useMemo(() => {
    const set = new Set<string>()
    assets.forEach((a) => a.tags?.split(',').forEach((t) => { const s = t.trim(); if (s) set.add(s) }))
    return [...set].sort()
  }, [assets])

  // ── Agrupado por categoria (visão cards) ─────────────────────────────────────
  const byCategory = useMemo(() => {
    const map: Record<string, Asset[]> = {}
    assets.forEach((a) => {
      if (!map[a.category]) map[a.category] = []
      map[a.category].push(a)
    })
    return map
  }, [assets])

  const showFlash = (msg: string, ok = true) => {
    setFlash({ msg, ok }); setTimeout(() => setFlash(null), 4000)
  }

  // ── CRUD helpers ──────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const specs: Record<string, unknown> = {}
    if (form.year)        specs.year        = parseInt(form.year)
    if (form.paymentType) specs.paymentType = form.paymentType
    if (form.verificacao) specs.verificacao = true
    if (form.docStatus)   specs.docStatus   = form.docStatus
    const r = await fetch('/api/compras/ativos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: form.category, subCategory: form.subCategory || undefined,
        vendorId: form.vendorId, costPrice: parseFloat(form.costPrice),
        salePrice: parseFloat(form.salePrice), displayName: form.displayName,
        description: form.description || undefined, tags: form.tags || undefined,
        vendorRef: form.vendorRef || undefined,
        specs: Object.keys(specs).length ? specs : undefined,
      }),
    })
    if (r.ok) { showFlash('Ativo cadastrado!'); setShowForm(false); load() }
    else { const e2 = await r.json().catch(() => ({})); showFlash((e2 as { error?: string }).error ?? 'Erro', false) }
    setSaving(false)
  }

  const openEdit = (a: Asset) => {
    setEditForm({
      displayName: a.displayName, subCategory: a.subCategory ?? '',
      salePrice: String(a.salePrice), costPrice: String(a.costPrice ?? ''),
      description: a.description ?? '', tags: a.tags ?? '', vendorRef: a.vendorRef ?? '',
    })
    setSelected(a); setShowEdit(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selected) return; setEditSaving(true)
    const payload: Record<string, unknown> = {
      displayName: editForm.displayName, subCategory: editForm.subCategory || null,
      salePrice: parseFloat(editForm.salePrice), description: editForm.description || null,
      tags: editForm.tags || null, vendorRef: editForm.vendorRef || null,
    }
    if (canSeeSensitive && editForm.costPrice) payload.costPrice = parseFloat(editForm.costPrice)
    const r = await fetch(`/api/compras/ativos/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (r.ok) { showFlash('Ativo atualizado!'); setShowEdit(false); setSelected(null); load() }
    else { const e2 = await r.json().catch(() => ({})); showFlash((e2 as { error?: string }).error ?? 'Erro', false) }
    setEditSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleteLoading(true)
    const r = await fetch(`/api/compras/ativos/${deleteTarget.id}`, { method: 'DELETE' })
    if (r.ok) { showFlash(`Ativo ${deleteTarget.adsId} excluído.`); setDeleteTarget(null); setSelected(null); load() }
    else { const e2 = await r.json().catch(() => ({})); showFlash((e2 as { error?: string }).error ?? 'Erro', false) }
    setDeleteLoading(false)
  }

  const requestSell = (a: Asset) => {
    setPendingStatus({ id: a.id, newStatus: 'SOLD' }); setBuyerName('')
  }

  const requestStatusChange = (id: string, newStatus: string) => {
    if (newStatus === 'SOLD') { setPendingStatus({ id, newStatus }); setBuyerName('') }
    else confirmStatusChange(id, newStatus, '')
  }

  const confirmStatusChange = async (id: string, newStatus: string, buyer: string) => {
    setStatusLoading(id)
    const body: Record<string, unknown> = { status: newStatus }
    if (buyer) body.buyerName = buyer
    await fetch(`/api/compras/ativos/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setStatusLoading(null); setPendingStatus(null); setSelected(null); load()
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── KPIs (Admin) ───────────────────────────────────────────────────── */}
      {isAdmin && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              label: 'Em Estoque',
              value: summary.availableCount.toString(),
              sub: 'ativos disponíveis',
              icon: <Package className="w-4 h-4" />,
              color: 'border-l-green-500',
              textColor: 'text-green-600',
            },
            {
              label: 'Custo Total',
              value: brl(summary.availableCostTotal),
              sub: 'capital investido',
              icon: <DollarSign className="w-4 h-4" />,
              color: 'border-l-red-500',
              textColor: 'text-red-600',
            },
            {
              label: 'Valor de Venda',
              value: brl(summary.availableSaleTotal),
              sub: 'receita potencial',
              icon: <BadgeDollarSign className="w-4 h-4" />,
              color: 'border-l-blue-500',
              textColor: 'text-blue-600',
            },
            {
              label: 'Margem Potencial',
              value: brl(summary.availableMargin),
              sub: `${summary.availableMarginPct}% sobre vendas`,
              icon: <TrendingUp className="w-4 h-4" />,
              color: 'border-l-emerald-500',
              textColor: 'text-emerald-600',
            },
            {
              label: 'Vendidos',
              value: summary.soldCount.toString(),
              sub: 'total histórico',
              icon: <ShoppingBag className="w-4 h-4" />,
              color: 'border-l-violet-500',
              textColor: 'text-violet-600',
            },
            {
              label: 'Receita Gerada',
              value: brl(summary.soldRevenue),
              sub: 'total de vendas',
              icon: <ArrowUpRight className="w-4 h-4" />,
              color: 'border-l-primary-500',
              textColor: 'text-primary-600',
            },
          ].map((k) => (
            <div key={k.label} className={`bg-white dark:bg-ads-dark-card rounded-xl border border-zinc-100 dark:border-zinc-800 border-l-4 ${k.color} p-3`}>
              <div className={`flex items-center gap-1.5 ${k.textColor} mb-1`}>
                {k.icon}
                <span className="text-[10px] font-bold uppercase tracking-wide">{k.label}</span>
              </div>
              <p className={`text-base font-bold ${k.textColor} leading-tight`}>{k.value}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── KPIs Comercial ─────────────────────────────────────────────────── */}
      {isCommercial && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CATEGORIES.filter((c) => (byStatus[`AVAILABLE_${c}`] ?? 0) > 0 || assets.some((a) => a.category === c && a.status === 'AVAILABLE')).slice(0, 4).map((cat) => {
            const count = assets.filter((a) => a.category === cat && a.status === 'AVAILABLE').length
            if (count === 0) return null
            return (
              <button key={cat} onClick={() => setCat(filterCat === cat ? '' : cat)}
                className={`rounded-xl border p-3 text-left transition-all ${filterCat === cat ? 'ring-2 ring-primary-500 border-primary-200' : 'border-zinc-200 dark:border-zinc-700 hover:shadow-sm'}`}>
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{count}</p>
                <p className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-block ${CATEGORY_COLORS[cat]}`}>{cat}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Filtros + controles ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              value={filterTag ? '' : q}
              onChange={(e) => { setFilterTag(''); setQ(e.target.value) }}
              placeholder="Buscar por ID, nome ou tag..."
              className="input-field pl-8 py-1.5 text-sm w-56"
            />
          </div>
          <select value={filterCat} onChange={(e) => setCat(e.target.value)} className="input-field py-1.5 text-sm">
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {isAdmin && (
            <select value={filterSt} onChange={(e) => setSt(e.target.value)} className="input-field py-1.5 text-sm">
              <option value="">Todos os status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          )}
          <button onClick={load} className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700" title="Atualizar">
            <RefreshCw className="w-4 h-4 text-zinc-500" />
          </button>
          {isAdmin && (
            <button onClick={() => setShowRaw((v) => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${showRaw ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-zinc-200 text-zinc-500'}`}>
              {showRaw ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Fornecedor / Custo
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle visão */}
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <button onClick={() => setViewMode('table')}
              className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30' : 'text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('cards')}
              className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30' : 'text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          {canWrite && (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus className="w-4 h-4" />Novo Ativo
            </button>
          )}
        </div>
      </div>

      {/* ── Status KPI strip (apenas Admin) ───────────────────────────────── */}
      {isAdmin && (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setSt(filterSt === s ? '' : s)}
              className={`rounded-xl border p-2 text-center transition-all text-xs ${filterSt === s ? 'ring-2 ring-primary-500 shadow' : 'hover:shadow-sm'} ${STATUS_COLOR[s] ?? 'bg-zinc-50'}`}>
              <p className="text-base font-bold">{byStatus[s] ?? 0}</p>
              <p className="text-[9px] font-semibold leading-tight">{STATUS_LABEL[s]}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Tag cloud ──────────────────────────────────────────────────────── */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          {allTags.map((tag) => (
            <button key={tag}
              onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                filterTag === tag
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700'
              }`}>{tag}</button>
          ))}
          {filterTag && (
            <button onClick={() => setFilterTag('')} className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 ml-1">
              <X className="w-3 h-3" /> limpar
            </button>
          )}
        </div>
      )}

      {/* ── Flash ──────────────────────────────────────────────────────────── */}
      {flash && (
        <div className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 ${flash.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {flash.ok ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {flash.msg}
        </div>
      )}

      {/* ── Modal: comprador ───────────────────────────────────────────────── */}
      {pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold">Registrar Comprador</h3>
            </div>
            <p className="text-sm text-zinc-500">Informe o nome do comprador para registrar a saída do estoque.</p>
            <input autoFocus value={buyerName} onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Nome do comprador..." className="input-field w-full" />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => confirmStatusChange(pendingStatus.id, pendingStatus.newStatus, buyerName)}
                disabled={statusLoading === pendingStatus.id}
                className="btn-primary flex items-center gap-1.5 flex-1 justify-center">
                {statusLoading === pendingStatus.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar Venda
              </button>
              <button onClick={() => setPendingStatus(null)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: excluir ─────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" /><h3 className="font-bold">Excluir Ativo</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Excluir <strong>{deleteTarget.adsId}</strong> — {deleteTarget.displayName}? Ação irreversível.
            </p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Excluir
              </button>
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: criar ───────────────────────────────────────────────────── */}
      {showForm && canWrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-700">
              <h2 className="font-bold">Novo Ativo</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Categoria *</label>
                  <select required value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input-field">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Sub-categoria</label>
                  <input value={form.subCategory} onChange={(e) => setForm((f) => ({ ...f, subCategory: e.target.value }))} className="input-field" placeholder="Ex: Warm-up 30d" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Fornecedor *</label>
                  <select required value={form.vendorId} onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))} className="input-field">
                    <option value="">Selecionar...</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Ref. Fornecedor</label>
                  <input value={form.vendorRef} onChange={(e) => setForm((f) => ({ ...f, vendorRef: e.target.value }))} className="input-field" placeholder="REF-001" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Custo (R$) *</label>
                  <input required type="number" step="0.01" min="0" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Preço Venda (R$) *</label>
                  <input required type="number" step="0.01" min="0" value={form.salePrice} onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))} className="input-field" />
                </div>
                {/* Calculadora de Margem 40-60% */}
                {form.costPrice && parseFloat(form.costPrice) > 0 && (
                  <div className="col-span-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Calculadora de Margem</p>
                    <div className="flex gap-2">
                      {[
                        { label: '40% mín.', val: 40, color: 'border-amber-300 text-amber-700 hover:bg-amber-50' },
                        { label: '50% ideal', val: 50, color: 'border-emerald-400 text-emerald-700 hover:bg-emerald-50' },
                        { label: '60% máx.', val: 60, color: 'border-blue-300 text-blue-700 hover:bg-blue-50' },
                      ].map(({ label, val, color }) => (
                        <button key={val} type="button" onClick={() => applyMargin(val)}
                          className={`flex-1 rounded-lg border py-1.5 text-[11px] font-bold transition-colors ${color}`}>
                          {label}<br />
                          <span className="font-mono text-[10px]">{brl(parseFloat(form.costPrice) * (1 + val / 100))}</span>
                        </button>
                      ))}
                    </div>
                    {form.salePrice && parseFloat(form.salePrice) > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        {(() => {
                          const m = ((parseFloat(form.salePrice) - parseFloat(form.costPrice)) / parseFloat(form.salePrice)) * 100
                          const color = m >= 50 ? 'text-emerald-600' : m >= 40 ? 'text-amber-600' : 'text-red-600'
                          return <span className={`font-bold ${color}`}>Margem atual: {pct(m)} · Lucro: {brl(parseFloat(form.salePrice) - parseFloat(form.costPrice))}</span>
                        })()}
                      </div>
                    )}
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Nome Comercial *</label>
                  <input required value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} className="input-field" placeholder="Ex: Gold Asset Premium — Perfil Warm-up" />
                </div>
                {/* Campos War Room OS */}
                <div>
                  <label className="block text-xs font-semibold mb-1">🍷 Safra (Ano)</label>
                  <input type="number" min="2000" max="2099" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} className="input-field" placeholder="2019" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Tipo de Pagamento</label>
                  <select value={form.paymentType} onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value }))} className="input-field">
                    <option value="">Selecionar...</option>
                    <option value="Manual">Manual</option>
                    <option value="Auto">Auto</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Status DOC / CNH</label>
                  <select value={form.docStatus} onChange={(e) => handleDocStatus(e.target.value)} className="input-field">
                    <option value="">Sem DOC</option>
                    <option value="Pendente">Pendente</option>
                    <option value="CNH Enviada">CNH Enviada</option>
                    <option value="CNH Validada">CNH Validada ✅</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input id="verificacao" type="checkbox" checked={form.verificacao} onChange={(e) => setForm((f) => ({ ...f, verificacao: e.target.checked }))} className="w-4 h-4 accent-primary-600" />
                  <label htmlFor="verificacao" className="text-xs font-semibold">Verificação OK ✅</label>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Tags <span className="font-normal text-zinc-400">(separadas por vírgula)</span></label>
                  <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} className="input-field" placeholder="warm-up,gold,30d" />
                  {form.tags.includes('cnh-validada') && (
                    <p className="text-[10px] text-emerald-600 mt-1">✅ Tag <code>cnh-validada</code> adicionada automaticamente</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Descrição</label>
                  <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field resize-none" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Cadastrar
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: editar ──────────────────────────────────────────────────── */}
      {showEdit && selected && canWrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-700">
              <div>
                <h2 className="font-bold">Editar Ativo</h2>
                <p className="text-xs text-zinc-400 font-mono">{selected.adsId}</p>
              </div>
              <button onClick={() => { setShowEdit(false); setSelected(null) }}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Nome Comercial *</label>
                  <input required value={editForm.displayName} onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Sub-categoria</label>
                  <input value={editForm.subCategory} onChange={(e) => setEditForm((f) => ({ ...f, subCategory: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Preço Venda (R$) *</label>
                  <input required type="number" step="0.01" min="0" value={editForm.salePrice} onChange={(e) => setEditForm((f) => ({ ...f, salePrice: e.target.value }))} className="input-field" />
                </div>
                {canSeeSensitive && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">Custo (R$)</label>
                    <input type="number" step="0.01" min="0" value={editForm.costPrice} onChange={(e) => setEditForm((f) => ({ ...f, costPrice: e.target.value }))} className="input-field" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold mb-1">Ref. Fornecedor</label>
                  <input value={editForm.vendorRef} onChange={(e) => setEditForm((f) => ({ ...f, vendorRef: e.target.value }))} className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Tags</label>
                  <input value={editForm.tags} onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))} className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Descrição</label>
                  <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} className="input-field resize-none" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={editSaving} className="btn-primary flex items-center gap-1.5">
                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Salvar
                </button>
                <button type="button" onClick={() => { setShowEdit(false); setSelected(null) }} className="btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail drawer ──────────────────────────────────────────────────── */}
      {selected && !showEdit && (
        <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-white dark:bg-ads-dark-card shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-700">
            <div>
              <p className="font-mono text-sm font-bold text-primary-600">{selected.adsId}</p>
              <p className="text-xs text-zinc-400 truncate max-w-[200px]">{selected.displayName}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {canWrite && (
                <>
                  <button onClick={() => openEdit(selected)} title="Editar"
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <Pencil className="w-4 h-4 text-zinc-500" />
                  </button>
                  {['AVAILABLE', 'QUARANTINE', 'DEAD'].includes(selected.status) && (
                    <button onClick={() => setDeleteTarget(selected)} title="Excluir"
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                </>
              )}
              <button onClick={() => setSelected(null)}><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${CATEGORY_COLORS[selected.category]}`}>{selected.category}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_COLOR[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
              {selected.subCategory && <span className="px-2 py-1 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{selected.subCategory}</span>}
            </div>

            <div>
              <p className="text-xs text-zinc-400 mb-0.5">Nome Comercial</p>
              <p className="font-bold text-zinc-900 dark:text-zinc-100">{selected.displayName}</p>
            </div>
            {selected.description && (
              <div><p className="text-xs text-zinc-400 mb-0.5">Descrição</p><p className="text-sm text-zinc-600 dark:text-zinc-400">{selected.description}</p></div>
            )}

            {/* Preço + Margem */}
            <div className="rounded-xl border border-zinc-100 dark:border-zinc-700 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400">Preço de Venda</p>
                <p className="text-xl font-bold text-primary-600">{brl(selected.salePrice)}</p>
              </div>
              {isAdmin && selected.costPrice != null && (
                <>
                  <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-700 pt-2">
                    <p className="text-xs text-zinc-400">Custo <span className="text-amber-500">(privado)</span></p>
                    <p className="font-bold text-red-600">{brl(selected.costPrice)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-400">Margem</p>
                    <div className="text-right">
                      <p className="font-bold text-emerald-600">{brl(selected.salePrice - selected.costPrice)}</p>
                      <p className="text-xs text-emerald-500">{pct(((selected.salePrice - selected.costPrice) / selected.salePrice) * 100)} sobre venda</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Fornecedor (Admin) */}
            {isAdmin && (selected.vendor || selected.vendorRef) && (
              <div className="rounded-xl border border-zinc-100 dark:border-zinc-700 p-3 space-y-2">
                {selected.vendor && (
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-400">Fornecedor</p>
                      <p className="text-sm font-semibold">{selected.vendor.name}</p>
                    </div>
                  </div>
                )}
                {selected.vendorRef && (
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-400">Referência</p>
                      <p className="text-sm font-mono font-semibold">{selected.vendorRef}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tags */}
            {selected.tags && (
              <div>
                <p className="text-xs text-zinc-400 mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.split(',').map((t) => {
                    const tag = t.trim()
                    return (
                      <button key={tag} onClick={() => { setFilterTag(tag); setSelected(null) }}
                        className="px-2.5 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[11px] font-semibold hover:bg-primary-100 flex items-center gap-1">
                        <Search className="w-2.5 h-2.5" />{tag}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Botão de venda (Comercial) */}
            {canSell && selected.status === 'AVAILABLE' && (
              <button onClick={() => requestSell(selected)}
                className="w-full btn-primary flex items-center justify-center gap-2 py-3">
                <ShoppingBag className="w-4 h-4" />Registrar Venda
              </button>
            )}

            {/* Avançar Status (Admin) */}
            {canWrite && TRANSITIONS[selected.status]?.length > 0 && (
              <div>
                <p className="text-xs text-zinc-400 mb-2">Avançar Status</p>
                <div className="flex flex-wrap gap-2">
                  {TRANSITIONS[selected.status].map((ns) => (
                    <button key={ns} onClick={() => requestStatusChange(selected.id, ns)}
                      disabled={statusLoading === selected.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 ${STATUS_COLOR[ns]} hover:opacity-80`}>
                      {statusLoading === selected.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <>→ {STATUS_LABEL[ns]}</>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Conteúdo: loading / vazio ──────────────────────────────────────── */}
      <div className="text-xs text-zinc-500 mb-1">
        {total} ativo(s)
        {filterTag && <span className="ml-2 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-semibold">tag: {filterTag}</span>}
        {filterSt && <span className="ml-2 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-semibold">{STATUS_LABEL[filterSt]}</span>}
      </div>

      {loading
        ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
        : assets.length === 0
          ? <div className="text-center py-16 text-zinc-400">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum ativo encontrado</p>
              {filterSt && <p className="text-xs mt-1">Tente remover o filtro de status</p>}
            </div>
          : viewMode === 'cards'
            /* ── Visão cards (catálogo por categoria) ──────────────────────── */
            ? (
              <div className="space-y-6">
                {Object.entries(byCategory).map(([cat, items]) => (
                  <section key={cat}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${CATEGORY_BG[cat] ?? 'from-zinc-500 to-zinc-700'}`} />
                      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{cat}</h3>
                      <span className="text-xs text-zinc-400">{items.length} ativo{items.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {items.map((a) => (
                        <div key={a.id}
                          className="group rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-ads-dark-card hover:shadow-md transition-all">
                          <div className={`h-1.5 rounded-t-xl bg-gradient-to-r ${CATEGORY_BG[a.category] ?? 'from-zinc-500 to-zinc-700'}`} />
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">{a.displayName}</p>
                                <p className="text-[10px] font-mono text-zinc-400">{a.adsId}</p>
                              </div>
                              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[a.status]}`}>
                                {STATUS_LABEL[a.status]}
                              </span>
                            </div>

                            {a.subCategory && <p className="text-xs text-zinc-500 mb-2">{a.subCategory}</p>}

                            {/* Tags */}
                            {a.tags && (
                              <div className="flex flex-wrap gap-1 mb-3">
                                {a.tags.split(',').slice(0, 3).map((t) => (
                                  <button key={t.trim()}
                                    onClick={() => setFilterTag(filterTag === t.trim() ? '' : t.trim())}
                                    className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] hover:bg-primary-100 hover:text-primary-700 transition-colors">
                                    {t.trim()}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Preços */}
                            <div className="flex items-end justify-between">
                              <div>
                                <p className="text-[10px] text-zinc-400">Preço de Venda</p>
                                <p className="text-lg font-bold text-primary-600">{brl(a.salePrice)}</p>
                                {isAdmin && a.costPrice != null && (
                                  <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                                    Margem: {pct(((a.salePrice - a.costPrice) / a.salePrice) * 100)}
                                    {showRaw && <> · Custo: {brl(a.costPrice)}</>}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-1.5">
                                {canSell && a.status === 'AVAILABLE' && (
                                  <button onClick={() => requestSell(a)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors">
                                    <ShoppingBag className="w-3 h-3" />Vender
                                  </button>
                                )}
                                <button onClick={() => setSelected(a)}
                                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                              </div>
                            </div>

                            {/* Fornecedor (Admin) */}
                            {isAdmin && showRaw && a.vendor && (
                              <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-700 flex items-center gap-1.5 text-[10px] text-zinc-400">
                                <Store className="w-3 h-3" />
                                <span>{a.vendor.name}</span>
                                {a.vendorRef && <span className="font-mono">· {a.vendorRef}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )
            /* ── Visão tabela ──────────────────────────────────────────────── */
            : (
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr className="text-left text-xs text-zinc-500 font-semibold">
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Nome Comercial</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Preço Venda</th>
                      {isAdmin && <th className="px-4 py-3 text-right">Custo</th>}
                      {isAdmin && <th className="px-4 py-3 text-right">Margem</th>}
                      {isAdmin && showRaw && <th className="px-4 py-3">Fornecedor</th>}
                      {isAdmin && showRaw && <th className="px-4 py-3">Referência</th>}
                      <th className="px-4 py-3">Tags</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {assets.map((a) => {
                      const margin = (a.costPrice != null)
                        ? ((a.salePrice - a.costPrice) / a.salePrice) * 100
                        : null
                      return (
                        <tr key={a.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer"
                          onClick={() => setSelected(a)}>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-primary-600">{a.adsId}</td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <p className="font-medium truncate">{a.displayName}</p>
                            {a.subCategory && <p className="text-[10px] text-zinc-400">{a.subCategory}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CATEGORY_COLORS[a.category] ?? 'bg-zinc-100'}`}>{a.category}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[a.status] ?? 'bg-zinc-100'}`}>{STATUS_LABEL[a.status]}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold">{brl(a.salePrice)}</td>
                          {isAdmin && <td className="px-4 py-3 text-right text-red-600 text-xs font-medium">{a.costPrice != null ? brl(a.costPrice) : '—'}</td>}
                          {isAdmin && (
                            <td className="px-4 py-3 text-right">
                              {margin != null
                                ? <span className={`text-xs font-bold ${margin >= 40 ? 'text-emerald-600' : margin >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {pct(margin)}
                                  </span>
                                : <span className="text-zinc-300">—</span>}
                            </td>
                          )}
                          {isAdmin && showRaw && <td className="px-4 py-3 text-xs text-zinc-500">{a.vendor?.name ?? '—'}</td>}
                          {isAdmin && showRaw && <td className="px-4 py-3 text-xs font-mono text-zinc-500">{a.vendorRef ?? '—'}</td>}
                          <td className="px-4 py-3 max-w-[140px]">
                            {a.tags
                              ? <div className="flex gap-1 flex-wrap">
                                  {a.tags.split(',').slice(0, 2).map((t) => {
                                    const tag = t.trim()
                                    return (
                                      <button key={tag}
                                        onClick={(e) => { e.stopPropagation(); setFilterTag(filterTag === tag ? '' : tag) }}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${filterTag === tag ? 'bg-primary-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-primary-100 hover:text-primary-700'}`}>
                                        {tag}
                                      </button>
                                    )
                                  })}
                                  {a.tags.split(',').length > 2 && <span className="text-[10px] text-zinc-400">+{a.tags.split(',').length - 2}</span>}
                                </div>
                              : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {canSell && a.status === 'AVAILABLE'
                              ? <button onClick={(e) => { e.stopPropagation(); requestSell(a) }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 text-primary-700 text-[10px] font-bold hover:bg-primary-100 transition-colors">
                                  <ShoppingBag className="w-3 h-3" />Vender
                                </button>
                              : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
      }
    </div>
  )
}
