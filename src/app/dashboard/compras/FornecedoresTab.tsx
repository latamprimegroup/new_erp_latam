'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Star, Store, Loader2, RefreshCw, X, Check, ChevronDown } from 'lucide-react'

type Vendor = {
  id: string; name: string; taxId: string | null; category: string; rating: number
  paymentTerms: string | null; active: boolean; notes: string | null
  contactInfo: Record<string, string> | null
  _count: { assets: number; purchaseOrders: number }
}

const CATEGORIES = ['CONTAS','INFRA','SOFTWARE','PROXIES','HARDWARE','OUTROS']

const STAR_COLOR = (r: number) => r >= 8 ? 'text-green-500' : r >= 5 ? 'text-amber-500' : 'text-red-400'

export function FornecedoresTab() {
  const [vendors, setVendors]   = useState<Vendor[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')
  const [category, setCategory] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [flash, setFlash]       = useState<string | null>(null)
  const [editing, setEditing]   = useState<Vendor | null>(null)

  const [form, setForm] = useState({
    name: '', taxId: '', category: 'CONTAS', rating: 8,
    paymentTerms: '', notes: '', whatsapp: '', email: '', telegram: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '30' })
    if (q) params.set('q', q)
    if (category) params.set('category', category)
    const r = await fetch(`/api/compras/fornecedores?${params}`)
    if (r.ok) { const j = await r.json(); setVendors(j.vendors ?? []); setTotal(j.total ?? 0) }
    setLoading(false)
  }, [q, category])

  useEffect(() => { load() }, [load])

  const openEdit = (v: Vendor) => {
    setEditing(v)
    setForm({
      name: v.name, taxId: v.taxId ?? '', category: v.category,
      rating: v.rating, paymentTerms: v.paymentTerms ?? '',
      notes: v.notes ?? '',
      whatsapp: v.contactInfo?.whatsapp ?? '',
      email: v.contactInfo?.email ?? '',
      telegram: v.contactInfo?.telegram ?? '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const payload = {
      name: form.name, taxId: form.taxId || undefined,
      category: form.category, rating: form.rating,
      paymentTerms: form.paymentTerms || undefined,
      notes: form.notes || undefined,
      contactInfo: {
        whatsapp: form.whatsapp, email: form.email, telegram: form.telegram,
      },
    }
    const url    = editing ? `/api/compras/fornecedores/${editing.id}` : '/api/compras/fornecedores'
    const method = editing ? 'PATCH' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (r.ok) {
      setFlash(editing ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!')
      setShowForm(false); setEditing(null); load()
    } else {
      const err = await r.json().catch(() => ({}))
      setFlash((err as { error?: string }).error ?? 'Erro')
    }
    setSaving(false)
    setTimeout(() => setFlash(null), 4000)
  }

  const archive = async (id: string) => {
    if (!confirm('Arquivar este fornecedor?')) return
    await fetch(`/api/compras/fornecedores/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar fornecedor..."
              className="input-field pl-8 py-1.5 text-sm w-48" />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field py-1.5 text-sm">
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700">
            <RefreshCw className="w-4 h-4 text-zinc-500" />
          </button>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name:'',taxId:'',category:'CONTAS',rating:8,paymentTerms:'',notes:'',whatsapp:'',email:'',telegram:'' }); setShowForm(true) }}
          className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" />Novo Fornecedor
        </button>
      </div>

      {flash && (
        <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm flex items-center gap-2">
          <Check className="w-3.5 h-3.5" />{flash}
        </div>
      )}

      {/* Modal de formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-ads-dark-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-700">
              <h2 className="font-bold">{editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null) }} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Nome *</label>
                  <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Ex: Supplier LATAM Pro" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">CPF/CNPJ</label>
                  <input value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Categoria *</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input-field">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Rating (1-10)</label>
                  <input type="number" min={1} max={10} value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: parseInt(e.target.value) || 5 }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Condições de Pagamento</label>
                  <input value={form.paymentTerms} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))} className="input-field" placeholder="Ex: PIX 24h" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">WhatsApp</label>
                  <input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} className="input-field" placeholder="+55..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">E-mail</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Telegram</label>
                  <input value={form.telegram} onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))} className="input-field" placeholder="@usuario" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">Observações</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-field resize-none" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editing ? 'Atualizar' : 'Cadastrar'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditing(null) }} className="btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="text-xs text-zinc-500 mb-1">{total} fornecedor(es) encontrado(s)</div>
      {loading
        ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
        : vendors.length === 0
          ? <div className="text-center py-12 text-zinc-400">Nenhum fornecedor cadastrado</div>
          : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {vendors.map((v) => (
                <div key={v.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-bold text-sm truncate">{v.name}</h3>
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-600">{v.category}</span>
                      </div>
                      {v.taxId && <p className="text-[10px] text-zinc-400 font-mono">{v.taxId}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 mt-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < v.rating ? STAR_COLOR(v.rating) : 'text-zinc-200'}`} fill={i < v.rating ? 'currentColor' : 'none'} />
                    ))}
                    <span className="text-[10px] text-zinc-400 ml-1">{v.rating}/10</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="text-center rounded-lg bg-zinc-50 dark:bg-zinc-800 py-1.5">
                      <p className="font-bold text-primary-600">{v._count.assets}</p>
                      <p className="text-[10px] text-zinc-400">Ativos</p>
                    </div>
                    <div className="text-center rounded-lg bg-zinc-50 dark:bg-zinc-800 py-1.5">
                      <p className="font-bold">{v._count.purchaseOrders}</p>
                      <p className="text-[10px] text-zinc-400">Pedidos</p>
                    </div>
                  </div>

                  {v.contactInfo?.whatsapp && (
                    <a href={`https://wa.me/${v.contactInfo.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      className="mt-3 text-[11px] text-green-600 hover:underline flex items-center gap-1">
                      💬 {v.contactInfo.whatsapp}
                    </a>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button onClick={() => openEdit(v)} className="flex-1 text-xs py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                      Editar
                    </button>
                    <button onClick={() => archive(v.id)} className="text-xs py-1.5 px-3 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                      Arquivar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
      }
    </div>
  )
}
