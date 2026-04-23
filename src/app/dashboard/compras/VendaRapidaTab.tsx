'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, ExternalLink, Plus, ToggleLeft, ToggleRight, Trash2, X, CheckCircle2, Clock, TrendingUp } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Listing {
  id:             string
  slug:           string
  title:          string
  subtitle:       string | null
  badge:          string | null
  assetCategory:  string
  pricePerUnit:   number
  maxQty:         number
  active:         boolean
  available:      number
  totalCheckouts: number
  paidCheckouts:  number
  revenue:        number
  createdAt:      string
}

const ASSET_CATEGORIES = [
  'GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS', 'AMAZON_ADS',
  'LINKEDIN_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS', 'OTHER',
]

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : ''

// ─── Componente ───────────────────────────────────────────────────────────────

export function VendaRapidaTab() {
  const [listings, setListings]     = useState<Listing[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [copiedId, setCopiedId]     = useState<string | null>(null)

  // Formulário
  const [title, setTitle]           = useState('')
  const [subtitle, setSubtitle]     = useState('')
  const [category, setCategory]     = useState('GOOGLE_ADS')
  const [price, setPrice]           = useState('')
  const [maxQty, setMaxQty]         = useState('10')
  const [badge, setBadge]           = useState('ENTREGA AUTOMÁTICA')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/listings')
      if (r.ok) setListings(await r.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const copyLink = async (slug: string) => {
    const url = `${BASE_URL}/loja/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedId(slug)
    setTimeout(() => setCopiedId(null), 2500)
  }

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/admin/listings/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    load()
  }

  const deleteListing = async (id: string, title: string) => {
    if (!confirm(`Excluir listing "${title}"? Esta ação não pode ser desfeita.`)) return
    await fetch(`/api/admin/listings/${id}`, { method: 'DELETE' })
    load()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/admin/listings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:         title.trim(),
        subtitle:      subtitle.trim() || undefined,
        assetCategory: category,
        pricePerUnit:  parseFloat(price),
        maxQty:        parseInt(maxQty),
        badge:         badge.trim() || 'ENTREGA AUTOMÁTICA',
        active:        true,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setShowForm(false)
      setTitle(''); setSubtitle(''); setPrice(''); setMaxQty('10'); setBadge('ENTREGA AUTOMÁTICA')
      load()
    } else {
      const d = await res.json()
      alert(d.error ?? 'Erro ao criar listing')
    }
  }

  const totalRevenue   = listings.reduce((s, l) => s + l.revenue, 0)
  const totalPaid      = listings.reduce((s, l) => s + l.paidCheckouts, 0)
  const totalCheckouts = listings.reduce((s, l) => s + l.totalCheckouts, 0)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} label="Faturamento" value={`R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
        <KpiCard icon={<CheckCircle2 className="w-5 h-5 text-blue-500" />} label="Vendas aprovadas" value={String(totalPaid)} />
        <KpiCard icon={<Clock className="w-5 h-5 text-amber-500" />} label="PIX gerados" value={String(totalCheckouts)} />
      </div>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg">Links de Venda Rápida</h2>
          <p className="text-zinc-500 text-sm">Gere links públicos de checkout e acompanhe as vendas</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
        >
          <Plus className="w-4 h-4" />
          Novo Link
        </button>
      </div>

      {/* Modal de criação */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-lg">Criar Link de Venda</h3>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Nome do produto">
                <input
                  required value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: TikTok Verificada, Google Ads Premium"
                  className="input-dark"
                />
              </Field>
              <Field label="Subtítulo (opcional)">
                <input
                  value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Ex: Conta aquecida e pronta para uso"
                  className="input-dark"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoria do ativo">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-dark">
                    {ASSET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c.replace('_', ' ')}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Preço por unidade (R$)">
                  <input
                    required type="number" min="1" step="0.01"
                    value={price} onChange={(e) => setPrice(e.target.value)}
                    placeholder="150.00"
                    className="input-dark"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Máx. unidades por pedido">
                  <input
                    type="number" min="1" max="100"
                    value={maxQty} onChange={(e) => setMaxQty(e.target.value)}
                    className="input-dark"
                  />
                </Field>
                <Field label="Badge (topo da página)">
                  <input
                    value={badge} onChange={(e) => setBadge(e.target.value)}
                    placeholder="ENTREGA AUTOMÁTICA"
                    className="input-dark"
                  />
                </Field>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 text-sm hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50"
                >
                  {saving ? 'Criando...' : 'Criar Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de listings */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-4xl mb-3">🛍️</p>
          <p className="font-medium">Nenhum link criado ainda</p>
          <p className="text-sm mt-1">Crie seu primeiro link de venda rápida para começar</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {listings.map((l) => {
            const url = `${BASE_URL}/loja/${l.slug}`
            return (
              <div
                key={l.id}
                className={`border rounded-2xl p-5 space-y-4 transition ${
                  l.active
                    ? 'bg-zinc-900/50 border-zinc-800'
                    : 'bg-zinc-950 border-zinc-800/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-base">{l.title}</span>
                      {l.badge && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                          {l.badge}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        l.active ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700 text-zinc-400'
                      }`}>
                        {l.active ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>
                    {l.subtitle && <p className="text-zinc-500 text-sm mt-0.5">{l.subtitle}</p>}
                    <p className="text-zinc-600 text-xs mt-1">{l.assetCategory.replace('_', ' ')} · R$ {l.pricePerUnit.toFixed(2)}/un · máx {l.maxQty} un</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(l.id, l.active)}
                      title={l.active ? 'Pausar' : 'Ativar'}
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                    >
                      {l.active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <a
                      href={url} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                      title="Abrir página"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => deleteListing(l.id, l.title)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <StatPill label="Disponível" value={`${l.available} un`} color="emerald" />
                  <StatPill label="PIX gerados" value={String(l.totalCheckouts)} color="blue" />
                  <StatPill label="Faturado" value={`R$ ${l.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} color="amber" />
                </div>

                {/* Link */}
                <div className="flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2">
                  <span className="text-zinc-400 text-xs font-mono flex-1 truncate">{url}</span>
                  <button
                    onClick={() => copyLink(l.slug)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                      copiedId === l.slug
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedId === l.slug ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-zinc-500 text-xs">{label}</p>
        <p className="text-white font-bold text-lg">{value}</p>
      </div>
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: string; color: 'emerald' | 'blue' | 'amber' }) {
  const colors = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    blue:    'bg-blue-500/10 text-blue-400',
    amber:   'bg-amber-500/10 text-amber-400',
  }
  return (
    <div className={`rounded-lg px-3 py-2 text-center ${colors[color]}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="font-bold text-sm">{value}</p>
    </div>
  )
}
