'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, Plus, Loader2, RefreshCw, X, Check, Eye, EyeOff,
  ChevronRight, Package, Pencil, Trash2, Tag, User, AlertTriangle,
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
const CATEGORIES = ['CONTAS', 'PERFIS', 'BM', 'PROXIES', 'SOFTWARE', 'INFRA', 'HARDWARE', 'OUTROS']
const STATUSES = Object.keys(STATUS_LABEL)

const TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ['QUARANTINE', 'SOLD', 'DEAD'],
  QUARANTINE: ['AVAILABLE', 'DEAD'],
  SOLD: ['AWAITING_VENDOR'],
  AWAITING_VENDOR: ['RECEIVED'],
  RECEIVED: ['TRIAGEM'],
  TRIAGEM: ['DELIVERED', 'DEAD'],
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Componente principal ─────────────────────────────────────────────────────

export function EstoqueTab({ role }: { role: string }) {
  const canSeeSensitive = role === 'ADMIN' || role === 'PURCHASING'
  const canWrite        = role === 'ADMIN' || role === 'PURCHASING'

  // ── Estado ──────────────────────────────────────────────────────────────────
  const [assets, setAssets]         = useState<Asset[]>([])
  const [byStatus, setByStatus]     = useState<ByStatus>({})
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [q, setQ]                   = useState('')
  const [filterCat, setCat]         = useState('')
  const [filterSt, setSt]           = useState('')
  const [filterTag, setFilterTag]   = useState('')
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
  })

  // Editar
  const [showEdit, setShowEdit]         = useState(false)
  const [editSaving, setEditSaving]     = useState(false)
  const [editForm, setEditForm] = useState({
    displayName: '', subCategory: '', salePrice: '', costPrice: '',
    description: '', tags: '', vendorRef: '',
  })

  // Excluir
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Saída (status change) com comprador
  const [pendingStatus, setPendingStatus] = useState<{ id: string; newStatus: string } | null>(null)
  const [buyerName, setBuyerName]         = useState('')
  const [statusLoading, setStatusLoading] = useState<string | null>(null)

  // ── Carregar ativos ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ limit: '50' })
    if (q)         p.set('q', q)
    if (filterTag) p.set('q', filterTag)   // tag sobrepõe q para filtro de tag
    if (filterCat) p.set('category', filterCat)
    if (filterSt)  p.set('status', filterSt)
    const r = await fetch(`/api/compras/ativos?${p}`)
    if (r.ok) {
      const j = await r.json()
      setAssets(j.assets ?? [])
      setByStatus(j.byStatus ?? {})
      setTotal(j.total ?? 0)
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

  // ── Tag cloud (tags únicas dos ativos carregados) ───────────────────────────
  const allTags = useMemo(() => {
    const set = new Set<string>()
    assets.forEach((a) => {
      a.tags?.split(',').forEach((t) => { const s = t.trim(); if (s) set.add(s) })
    })
    return [...set].sort()
  }, [assets])

  const showFlash = (msg: string, ok = true) => {
    setFlash({ msg, ok })
    setTimeout(() => setFlash(null), 4000)
  }

  // ── Criar ativo ──────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const payload = {
      category: form.category, subCategory: form.subCategory || undefined,
      vendorId: form.vendorId, costPrice: parseFloat(form.costPrice),
      salePrice: parseFloat(form.salePrice), displayName: form.displayName,
      description: form.description || undefined, tags: form.tags || undefined,
      vendorRef: form.vendorRef || undefined,
    }
    const r = await fetch('/api/compras/ativos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (r.ok) {
      const j = await r.json()
      showFlash(`Ativo ${(j as Asset).adsId} criado com sucesso!`)
      setShowForm(false)
      load()
    } else {
      const err = await r.json().catch(() => ({}))
      showFlash((err as { error?: string }).error ?? 'Erro ao criar ativo', false)
    }
    setSaving(false)
  }

  // ── Editar ativo ─────────────────────────────────────────────────────────────
  const openEdit = (a: Asset) => {
    setEditForm({
      displayName: a.displayName,
      subCategory: a.subCategory ?? '',
      salePrice:   String(a.salePrice),
      costPrice:   String(a.costPrice ?? ''),
      description: a.description ?? '',
      tags:        a.tags ?? '',
      vendorRef:   a.vendorRef ?? '',
    })
    setSelected(a)
    setShowEdit(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setEditSaving(true)
    const payload: Record<string, unknown> = {
      displayName:  editForm.displayName,
      subCategory:  editForm.subCategory || null,
      salePrice:    parseFloat(editForm.salePrice),
      description:  editForm.description || null,
      tags:         editForm.tags || null,
      vendorRef:    editForm.vendorRef || null,
    }
    if (canSeeSensitive && editForm.costPrice) payload.costPrice = parseFloat(editForm.costPrice)

    const r = await fetch(`/api/compras/ativos/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (r.ok) {
      showFlash('Ativo atualizado!')
      setShowEdit(false)
      setSelected(null)
      load()
    } else {
      const err = await r.json().catch(() => ({}))
      showFlash((err as { error?: string }).error ?? 'Erro ao editar', false)
    }
    setEditSaving(false)
  }

  // ── Excluir ativo ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const r = await fetch(`/api/compras/ativos/${deleteTarget.id}`, { method: 'DELETE' })
    if (r.ok) {
      showFlash(`Ativo ${deleteTarget.adsId} excluído.`)
      setDeleteTarget(null)
      setSelected(null)
      load()
    } else {
      const err = await r.json().catch(() => ({}))
      showFlash((err as { error?: string }).error ?? 'Erro ao excluir', false)
    }
    setDeleteLoading(false)
  }

  // ── Mudança de status (com comprador para SOLD) ──────────────────────────────
  const requestStatusChange = (id: string, newStatus: string) => {
    if (newStatus === 'SOLD') {
      setPendingStatus({ id, newStatus })
      setBuyerName('')
    } else {
      confirmStatusChange(id, newStatus, '')
    }
  }

  const confirmStatusChange = async (id: string, newStatus: string, buyer: string) => {
    setStatusLoading(id)
    const body: Record<string, unknown> = { status: newStatus }
    if (buyer) body.buyerName = buyer
    await fetch(`/api/compras/ativos/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setStatusLoading(null)
    setPendingStatus(null)
    setSelected(null)
    load()
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setSt(filterSt === s ? '' : s)}
            className={`rounded-xl border p-2 text-center transition-all ${filterSt === s ? 'ring-2 ring-primary-500' : 'hover:shadow-sm'} ${STATUS_COLOR[s] ?? 'bg-zinc-50'}`}>
            <p className="text-lg font-bold">{byStatus[s] ?? 0}</p>
            <p className="text-[10px] font-semibold">{STATUS_LABEL[s]}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              value={filterTag ? '' : q}
              onChange={(e) => { setFilterTag(''); setQ(e.target.value) }}
              placeholder="Buscar por ID ou nome..."
              className="input-field pl-8 py-1.5 text-sm w-52"
            />
          </div>
          <select value={filterCat} onChange={(e) => setCat(e.target.value)} className="input-field py-1.5 text-sm">
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700" title="Atualizar">
            <RefreshCw className="w-4 h-4 text-zinc-500" />
          </button>
          {canSeeSensitive && (
            <button onClick={() => setShowRaw((v) => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${showRaw ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-zinc-200 text-zinc-500'}`}>
              {showRaw ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showRaw ? 'Ocultar Fornecedor' : 'Ver Fornecedor'}
            </button>
          )}
        </div>
        {canWrite && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" />Novo Ativo
          </button>
        )}
      </div>

      {/* Tag cloud */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all ${
                filterTag === tag
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700'
              }`}
            >
              {tag}
            </button>
          ))}
          {filterTag && (
            <button onClick={() => setFilterTag('')} className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 ml-1">
              <X className="w-3 h-3" /> limpar filtro
            </button>
          )}
        </div>
      )}

      {/* Flash */}
      {flash && (
        <div className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 ${flash.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {flash.ok ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {flash.msg}
        </div>
      )}

      {/* Modal: comprador ao vender */}
      {pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold">Registrar Comprador</h3>
            </div>
            <p className="text-sm text-zinc-500">Informe o nome do comprador para registrar a saída do estoque.</p>
            <input
              autoFocus
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Nome completo do comprador..."
              className="input-field w-full"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => confirmStatusChange(pendingStatus.id, pendingStatus.newStatus, buyerName)}
                disabled={statusLoading === pendingStatus.id}
                className="btn-primary flex items-center gap-1.5 flex-1 justify-center"
              >
                {statusLoading === pendingStatus.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar Venda
              </button>
              <button onClick={() => setPendingStatus(null)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: excluir */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              <h3 className="font-bold">Excluir Ativo</h3>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Tem certeza que deseja excluir <strong>{deleteTarget.adsId}</strong> — <span className="font-medium">{deleteTarget.displayName}</span>?
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir
              </button>
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: criar novo ativo */}
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
                  <input value={form.vendorRef} onChange={(e) => setForm((f) => ({ ...f, vendorRef: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Custo (R$) *</label>
                  <input required type="number" step="0.01" min="0" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Preço de Venda (R$) *</label>
                  <input required type="number" step="0.01" min="0" value={form.salePrice} onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))} className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Nome Comercial *</label>
                  <input required value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} className="input-field" placeholder="Ex: Gold Asset Premium — Perfil Warm-up" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Descrição</label>
                  <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Tags <span className="font-normal text-zinc-400">(separadas por vírgula)</span></label>
                  <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} className="input-field" placeholder="warm-up,gold,proxy-dedicado" />
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

      {/* Modal: editar ativo */}
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
                  <input value={editForm.subCategory} onChange={(e) => setEditForm((f) => ({ ...f, subCategory: e.target.value }))} className="input-field" placeholder="Ex: Warm-up 30d" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Preço de Venda (R$) *</label>
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
                  <label className="block text-xs font-semibold mb-1">Tags <span className="font-normal text-zinc-400">(separadas por vírgula)</span></label>
                  <input value={editForm.tags} onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))} className="input-field" placeholder="warm-up,gold,proxy-dedicado" />
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

      {/* Detail drawer */}
      {selected && !showEdit && (
        <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-white dark:bg-ads-dark-card shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-700">
            <div>
              <h3 className="font-bold font-mono text-primary-600">{selected.adsId}</h3>
              <p className="text-xs text-zinc-400 truncate max-w-[200px]">{selected.displayName}</p>
            </div>
            <div className="flex items-center gap-2">
              {canWrite && (
                <>
                  <button onClick={() => openEdit(selected)} title="Editar"
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <Pencil className="w-4 h-4 text-zinc-500" />
                  </button>
                  {['AVAILABLE', 'QUARANTINE', 'DEAD'].includes(selected.status) && (
                    <button onClick={() => setDeleteTarget(selected)} title="Excluir"
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  )}
                </>
              )}
              <button onClick={() => setSelected(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${CATEGORY_COLORS[selected.category]}`}>{selected.category}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_COLOR[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
              {selected.subCategory && <span className="px-2 py-1 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600">{selected.subCategory}</span>}
            </div>

            {/* Nome */}
            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-0.5">Nome Comercial</p>
              <p className="font-bold text-zinc-900 dark:text-zinc-100">{selected.displayName}</p>
            </div>

            {/* Descrição */}
            {selected.description && (
              <div>
                <p className="text-xs font-semibold text-zinc-400 mb-0.5">Descrição</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{selected.description}</p>
              </div>
            )}

            {/* Tags */}
            {selected.tags && (
              <div>
                <p className="text-xs font-semibold text-zinc-400 mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.split(',').map((t) => {
                    const tag = t.trim()
                    return (
                      <button key={tag} onClick={() => { setFilterTag(tag); setSelected(null) }}
                        className="px-2.5 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[11px] font-semibold hover:bg-primary-100 transition-colors flex items-center gap-1">
                        <Search className="w-2.5 h-2.5" />{tag}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">Clique numa tag para filtrar o estoque</p>
              </div>
            )}

            {/* Preço */}
            <div className="rounded-xl border border-zinc-100 dark:border-zinc-700 p-3">
              <p className="text-xs font-semibold text-zinc-400 mb-1">Preço de Venda</p>
              <p className="text-2xl font-bold text-primary-600">{brl(selected.salePrice)}</p>
              {canSeeSensitive && selected.costPrice != null && (
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-700 space-y-1">
                  <p className="text-xs text-zinc-400">Custo <span className="text-[10px] text-amber-500">(confidencial)</span></p>
                  <p className="font-bold text-red-600">{brl(selected.costPrice)}</p>
                  <p className="text-xs text-green-600 font-medium">
                    Margem: {Math.round(((selected.salePrice - selected.costPrice) / selected.salePrice) * 100)}%
                  </p>
                  {selected.vendor && <p className="text-xs text-zinc-400">Fornecedor: <span className="font-medium">{selected.vendor.name}</span></p>}
                </div>
              )}
            </div>

            {/* Ações de status */}
            {canWrite && TRANSITIONS[selected.status]?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-400 mb-2">Avançar Status</p>
                <div className="flex flex-wrap gap-2">
                  {TRANSITIONS[selected.status].map((ns) => (
                    <button key={ns}
                      onClick={() => requestStatusChange(selected.id, ns)}
                      disabled={statusLoading === selected.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${STATUS_COLOR[ns]} hover:opacity-80 flex items-center gap-1.5`}>
                      {statusLoading === selected.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <>{ns === 'SOLD' && <User className="w-3 h-3" />}→ {STATUS_LABEL[ns]}</>}
                    </button>
                  ))}
                </div>
                {TRANSITIONS[selected.status].includes('SOLD') && (
                  <p className="text-[10px] text-zinc-400 mt-1.5">Ao marcar como Vendido, será pedido o nome do comprador.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="text-xs text-zinc-500 mb-1">
        {total} ativo(s) encontrado(s)
        {filterTag && <span className="ml-2 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-semibold">tag: {filterTag}</span>}
      </div>

      {loading
        ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
        : assets.length === 0
          ? <div className="text-center py-12 text-zinc-400">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhum ativo encontrado
            </div>
          : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr className="text-left text-xs text-zinc-500 font-semibold">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Nome Comercial</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Preço Venda</th>
                    {canSeeSensitive && showRaw && <th className="px-4 py-3">Custo</th>}
                    {canSeeSensitive && showRaw && <th className="px-4 py-3">Fornecedor</th>}
                    <th className="px-4 py-3">Tags</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {assets.map((a) => (
                    <tr key={a.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer" onClick={() => setSelected(a)}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-primary-600">{a.adsId}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[200px]">{a.displayName}</p>
                        {a.subCategory && <p className="text-[10px] text-zinc-400">{a.subCategory}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CATEGORY_COLORS[a.category] ?? 'bg-zinc-100'}`}>{a.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[a.status] ?? 'bg-zinc-100'}`}>{STATUS_LABEL[a.status]}</span>
                      </td>
                      <td className="px-4 py-3 font-bold">{brl(a.salePrice)}</td>
                      {canSeeSensitive && showRaw && (
                        <td className="px-4 py-3 text-red-600 text-xs">{a.costPrice != null ? brl(a.costPrice) : '—'}</td>
                      )}
                      {canSeeSensitive && showRaw && (
                        <td className="px-4 py-3 text-xs text-zinc-500">{a.vendor?.name ?? '—'}</td>
                      )}
                      <td className="px-4 py-3 max-w-[160px]">
                        {a.tags ? (
                          <div className="flex gap-1 flex-wrap">
                            {a.tags.split(',').slice(0, 3).map((t) => {
                              const tag = t.trim()
                              return (
                                <button key={tag}
                                  onClick={(e) => { e.stopPropagation(); setFilterTag(filterTag === tag ? '' : tag) }}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                    filterTag === tag
                                      ? 'bg-primary-600 text-white'
                                      : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-primary-100 hover:text-primary-700'
                                  }`}>
                                  {tag}
                                </button>
                              )
                            })}
                            {a.tags.split(',').length > 3 && (
                              <span className="text-[10px] text-zinc-400">+{a.tags.split(',').length - 3}</span>
                            )}
                          </div>
                        ) : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }
    </div>
  )
}
