'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search, Plus, Loader2, RefreshCw, X, Check, Eye, EyeOff, ChevronRight, Package } from 'lucide-react'

type Asset = {
  id: string; adsId: string; category: string; subCategory: string | null
  status: string; salePrice: number; displayName: string; description: string | null
  tags: string | null; createdAt: string
  // Visível apenas para PURCHASING/ADMIN
  vendorId?: string; costPrice?: number; vendorRef?: string; vendor?: { name: string; category: string; rating: number }
  _count?: { movements: number }
}

type ByStatus = Record<string, number>

const STATUS_LABEL: Record<string, string>  = { AVAILABLE:'Disponível', QUARANTINE:'Quarentena', SOLD:'Vendido', AWAITING_VENDOR:'Aguard. Fornec.', RECEIVED:'Recebido', TRIAGEM:'Em Triagem', DELIVERED:'Entregue', DEAD:'Baixado' }
const STATUS_COLOR: Record<string, string>  = { AVAILABLE:'bg-green-100 text-green-700', QUARANTINE:'bg-amber-100 text-amber-700', SOLD:'bg-blue-100 text-blue-700', AWAITING_VENDOR:'bg-orange-100 text-orange-700', RECEIVED:'bg-teal-100 text-teal-700', TRIAGEM:'bg-violet-100 text-violet-700', DELIVERED:'bg-zinc-100 text-zinc-500', DEAD:'bg-red-100 text-red-600' }
const CATEGORY_COLORS: Record<string, string> = { CONTAS:'bg-primary-100 text-primary-700', PERFIS:'bg-violet-100 text-violet-700', BM:'bg-blue-100 text-blue-700', PROXIES:'bg-orange-100 text-orange-700', SOFTWARE:'bg-green-100 text-green-700', INFRA:'bg-zinc-100 text-zinc-600', HARDWARE:'bg-rose-100 text-rose-700', OUTROS:'bg-gray-100 text-gray-600' }
const CATEGORIES = ['CONTAS','PERFIS','BM','PROXIES','SOFTWARE','INFRA','HARDWARE','OUTROS']
const STATUSES   = Object.keys(STATUS_LABEL)

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function EstoqueTab({ role }: { role: string }) {
  const canSeeSensitive = role === 'ADMIN' || role === 'PURCHASING'

  const [assets, setAssets]     = useState<Asset[]>([])
  const [byStatus, setByStatus] = useState<ByStatus>({})
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')
  const [filterCat, setCat]     = useState('')
  const [filterSt, setSt]       = useState('')
  const [showRaw, setShowRaw]   = useState(false)
  const [selected, setSelected] = useState<Asset | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [flash, setFlash]       = useState<string | null>(null)
  const [vendors, setVendors]   = useState<{ id: string; name: string }[]>([])
  const [changingStatus, setChangingStatus] = useState<string | null>(null)

  const [form, setForm] = useState({
    category: 'CONTAS', subCategory: '', vendorId: '', costPrice: '',
    salePrice: '', displayName: '', description: '', tags: '', vendorRef: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ limit: '30' })
    if (q)         p.set('q', q)
    if (filterCat) p.set('category', filterCat)
    if (filterSt)  p.set('status', filterSt)
    const r = await fetch(`/api/compras/ativos?${p}`)
    if (r.ok) { const j = await r.json(); setAssets(j.assets ?? []); setByStatus(j.byStatus ?? {}); setTotal(j.total ?? 0) }
    setLoading(false)
  }, [q, filterCat, filterSt])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!canSeeSensitive) return
    fetch('/api/compras/fornecedores?limit=100').then((r) => r.json()).then((j) => setVendors(j.vendors?.map((v: {id:string;name:string}) => ({ id: v.id, name: v.name })) ?? []))
  }, [canSeeSensitive])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const payload = {
      category: form.category, subCategory: form.subCategory || undefined,
      vendorId: form.vendorId, costPrice: parseFloat(form.costPrice),
      salePrice: parseFloat(form.salePrice), displayName: form.displayName,
      description: form.description || undefined, tags: form.tags || undefined,
      vendorRef: form.vendorRef || undefined,
    }
    const r = await fetch('/api/compras/ativos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (r.ok) { const j = await r.json(); setFlash(`Ativo ${(j as Asset).adsId} criado!`); setShowForm(false); load() }
    else { const err = await r.json().catch(() => ({})); setFlash((err as {error?:string}).error ?? 'Erro') }
    setSaving(false); setTimeout(() => setFlash(null), 4000)
  }

  const TRANSITIONS: Record<string, string[]> = {
    AVAILABLE: ['QUARANTINE','SOLD','DEAD'],
    QUARANTINE: ['AVAILABLE','DEAD'],
    SOLD: ['AWAITING_VENDOR'],
    AWAITING_VENDOR: ['RECEIVED'],
    RECEIVED: ['TRIAGEM'],
    TRIAGEM: ['DELIVERED','DEAD'],
  }

  const changeStatus = async (id: string, newStatus: string) => {
    setChangingStatus(id)
    await fetch(`/api/compras/ativos/${id}/status`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: newStatus }) })
    setChangingStatus(null); load()
  }

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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ID ou nome..."
              className="input-field pl-8 py-1.5 text-sm w-52" />
          </div>
          <select value={filterCat} onChange={(e) => setCat(e.target.value)} className="input-field py-1.5 text-sm">
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700">
            <RefreshCw className="w-4 h-4 text-zinc-500" />
          </button>
          {canSeeSensitive && (
            <button onClick={() => setShowRaw((v) => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${showRaw ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-zinc-200 text-zinc-500'}`}>
              {showRaw ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showRaw ? 'Ocultar Dados Fornecedor' : 'Ver Dados Fornecedor'}
            </button>
          )}
        </div>
        {canSeeSensitive && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" />Novo Ativo
          </button>
        )}
      </div>

      {flash && (
        <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm flex items-center gap-2">
          <Check className="w-3.5 h-3.5" />{flash}
        </div>
      )}

      {/* Modal novo ativo */}
      {showForm && canSeeSensitive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-700">
              <h2 className="font-bold">Novo Ativo</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
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
                  <label className="block text-xs font-semibold mb-1">Nome Comercial (Ads Ativos) *</label>
                  <input required value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} className="input-field" placeholder="Ex: Gold Asset Premium — Perfil Warm-up" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Descrição comercial</label>
                  <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Tags (separadas por vírgula)</label>
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

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-white dark:bg-ads-dark-card shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-700">
            <h3 className="font-bold">{selected.adsId}</h3>
            <button onClick={() => setSelected(null)}><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${CATEGORY_COLORS[selected.category]}`}>{selected.category}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_COLOR[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-500">Nome Comercial</p>
              <p className="font-bold">{selected.displayName}</p>
            </div>
            {selected.subCategory && <div><p className="text-xs font-semibold text-zinc-500">Sub-categoria</p><p>{selected.subCategory}</p></div>}
            {selected.description && <div><p className="text-xs font-semibold text-zinc-500">Descrição</p><p className="text-sm">{selected.description}</p></div>}
            {selected.tags && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">{selected.tags.split(',').map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-zinc-100 text-xs">{t.trim()}</span>)}</div>
              </div>
            )}
            <div className="rounded-xl border border-zinc-100 dark:border-zinc-700 p-3">
              <p className="text-xs font-semibold text-zinc-500 mb-2">Preço de Venda</p>
              <p className="text-2xl font-bold text-primary-600">{brl(selected.salePrice)}</p>
              {canSeeSensitive && selected.costPrice != null && (
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-700">
                  <p className="text-xs text-zinc-500">Custo (confidencial)</p>
                  <p className="font-bold text-red-600">{brl(selected.costPrice)}</p>
                  <p className="text-xs text-green-600 mt-1">Margem: {Math.round(((selected.salePrice - selected.costPrice) / selected.salePrice) * 100)}%</p>
                  {selected.vendor && <p className="text-xs text-zinc-400 mt-1">Fornecedor: {selected.vendor.name}</p>}
                </div>
              )}
            </div>

            {/* Mudança de status */}
            {TRANSITIONS[selected.status] && TRANSITIONS[selected.status].length > 0 && canSeeSensitive && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 mb-2">Avançar Status</p>
                <div className="flex flex-wrap gap-2">
                  {TRANSITIONS[selected.status].map((ns) => (
                    <button key={ns} onClick={() => { changeStatus(selected.id, ns); setSelected(null) }}
                      disabled={changingStatus === selected.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${STATUS_COLOR[ns]} hover:opacity-80`}>
                      {changingStatus === selected.id ? <Loader2 className="w-3 h-3 animate-spin" /> : `→ ${STATUS_LABEL[ns]}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="text-xs text-zinc-500 mb-1">{total} ativo(s) encontrado(s)</div>
      {loading
        ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
        : assets.length === 0
          ? <div className="text-center py-12 text-zinc-400">Nenhum ativo encontrado</div>
          : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr className="text-left text-xs text-zinc-500 font-semibold">
                    <th className="px-4 py-3">ID Ads Ativos</th>
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
                      {canSeeSensitive && showRaw && <td className="px-4 py-3 text-red-600 text-xs">{a.costPrice != null ? brl(a.costPrice) : '—'}</td>}
                      {canSeeSensitive && showRaw && <td className="px-4 py-3 text-xs text-zinc-500">{a.vendor?.name ?? '—'}</td>}
                      <td className="px-4 py-3">
                        {a.tags ? (
                          <div className="flex gap-1 flex-wrap">
                            {a.tags.split(',').slice(0, 2).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px]">{t.trim()}</span>
                            ))}
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
