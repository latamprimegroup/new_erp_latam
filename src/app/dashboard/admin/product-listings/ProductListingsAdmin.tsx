'use client'

/**
 * ProductListingsAdmin — Gestão de Produtos com Mapeamento de Perfil (Onboarding Motor)
 *
 * Permite criar e editar ProductListings incluindo o campo `destinationProfile`
 * que controla qual área de acesso o comprador recebe após o pagamento.
 */
import { useState, useEffect, useCallback } from 'react'
import { PROFILE_THEMES, PROFILE_TYPE_LABELS } from '@/lib/client-profile-config'
import type { ClientProfileType } from '@/lib/client-profile-config'

type Listing = {
  id:                 string
  slug:               string
  title:              string
  subtitle:           string | null
  assetCategory:      string
  assetTags:          string | null
  pricePerUnit:       number
  maxQty:             number
  warrantyDays:       number
  destinationProfile: ClientProfileType | null
  badge:              string | null
  active:             boolean
  createdAt:          string
  checkoutsCount:     number
}

const EMPTY_FORM = {
  slug:               '',
  title:              '',
  subtitle:           '',
  assetCategory:      '',
  assetTags:          '',
  pricePerUnit:       0,
  maxQty:             10,
  warrantyDays:       7,
  destinationProfile: '' as string,
  badge:              '',
  active:             true,
}

type Form = typeof EMPTY_FORM

const PROFILE_OPTIONS: Array<{ value: string; label: string; emoji: string }> = [
  { value: '', label: 'Nenhum (sem acesso automático)', emoji: '—' },
  ...Object.entries(PROFILE_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
    emoji: PROFILE_THEMES[value as ClientProfileType]?.emoji ?? '📦',
  })),
]

export function ProductListingsAdmin() {
  const [listings, setListings]   = useState<Listing[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<Form>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const fetchListings = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/admin/product-listings')
    const data = await res.json()
    setListings(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchListings() }, [fetchListings])

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setMsg(null)
  }

  function openEdit(l: Listing) {
    setEditId(l.id)
    setForm({
      slug:               l.slug,
      title:              l.title,
      subtitle:           l.subtitle ?? '',
      assetCategory:      l.assetCategory,
      assetTags:          l.assetTags ?? '',
      pricePerUnit:       l.pricePerUnit,
      maxQty:             l.maxQty,
      warrantyDays:       l.warrantyDays,
      destinationProfile: l.destinationProfile ?? '',
      badge:              l.badge ?? '',
      active:             l.active,
    })
    setShowForm(true)
    setMsg(null)
  }

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    const body = {
      ...form,
      pricePerUnit:       Number(form.pricePerUnit),
      maxQty:             Number(form.maxQty),
      warrantyDays:       Number(form.warrantyDays),
      destinationProfile: form.destinationProfile || null,
      subtitle:           form.subtitle || null,
      assetTags:          form.assetTags || null,
      badge:              form.badge || null,
    }
    const res = editId
      ? await fetch(`/api/admin/product-listings/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/admin/product-listings', { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      setMsg({ type: 'ok', text: editId ? 'Produto atualizado!' : 'Produto criado com sucesso!' })
      fetchListings()
      if (!editId) { setShowForm(false); setForm(EMPTY_FORM) }
    } else {
      const err = await res.json().catch(() => ({}))
      setMsg({ type: 'err', text: err?.error ?? 'Erro ao salvar.' })
    }
    setSaving(false)
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/admin/product-listings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !active }) })
    fetchListings()
  }

  const theme_for = (p: ClientProfileType | null) => p ? PROFILE_THEMES[p] : null

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">🛒 Produtos & Onboarding Motor</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Cada produto concede acesso automático a uma área de cliente após o pagamento.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition"
        >
          + Novo Produto
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
          <h2 className="text-lg font-bold text-white">
            {editId ? '✏️ Editar Produto' : '➕ Novo Produto'}
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Slug (URL)" value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v }))} placeholder="google-ads-premium" disabled={!!editId} />
            <Field label="Título" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Google Ads Premium" />
            <Field label="Subtítulo" value={form.subtitle} onChange={(v) => setForm((f) => ({ ...f, subtitle: v }))} placeholder="Conta com gastos históricos" />
            <Field label="Categoria do Ativo" value={form.assetCategory} onChange={(v) => setForm((f) => ({ ...f, assetCategory: v }))} placeholder="google_ads" />
            <Field label="Tags de Filtro" value={form.assetTags} onChange={(v) => setForm((f) => ({ ...f, assetTags: v }))} placeholder="premium,verificada" />
            <Field label="Badge (ex: ENTREGA AUTOMÁTICA)" value={form.badge} onChange={(v) => setForm((f) => ({ ...f, badge: v }))} placeholder="MELHOR SELLER" />
            <FieldNum label="Preço (R$)" value={form.pricePerUnit} onChange={(v) => setForm((f) => ({ ...f, pricePerUnit: v }))} />
            <FieldNum label="Qtd Máxima" value={form.maxQty} onChange={(v) => setForm((f) => ({ ...f, maxQty: v }))} />
            <FieldNum label="Dias de Garantia" value={form.warrantyDays} onChange={(v) => setForm((f) => ({ ...f, warrantyDays: v }))} />

            {/* Perfil de Destino — campo central do Onboarding Motor */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide">
                🎯 Perfil de Destino (Onboarding Automático)
              </label>
              <select
                value={form.destinationProfile}
                onChange={(e) => setForm((f) => ({ ...f, destinationProfile: e.target.value }))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {PROFILE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.emoji} {opt.label}
                  </option>
                ))}
              </select>
              {form.destinationProfile && (
                <p className="mt-2 text-xs text-zinc-500">
                  ✅ Após o pagamento, o comprador receberá acesso automático à área{' '}
                  <strong className="text-zinc-300">
                    {PROFILE_THEMES[form.destinationProfile as ClientProfileType]?.label}
                  </strong>
                  {' '}e será criada uma conta no sistema caso o e-mail ainda não exista.
                </p>
              )}
            </div>

            {editId && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Ativo</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${form.active ? 'bg-green-600' : 'bg-zinc-600'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${form.active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )}
          </div>

          {msg && (
            <p className={`text-sm font-medium ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {msg.text}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-violet-600 hover:bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition"
            >
              {saving ? 'Salvando…' : editId ? 'Atualizar' : 'Criar Produto'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditId(null) }}
              className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando produtos…</p>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center">
          <p className="text-zinc-500 text-sm">Nenhum produto cadastrado ainda.</p>
          <p className="text-zinc-600 text-xs mt-1">Clique em "Novo Produto" para criar o primeiro checkout público.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => {
            const t = theme_for(l.destinationProfile)
            return (
              <div
                key={l.id}
                className={`rounded-2xl border bg-zinc-900/70 p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${l.active ? 'border-zinc-700/50' : 'border-zinc-800/40 opacity-50'}`}
              >
                {/* Info principal */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {l.badge && (
                      <span className="rounded-full bg-violet-600/20 border border-violet-500/30 px-2 py-0.5 text-[10px] font-bold text-violet-300 uppercase">
                        {l.badge}
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${l.active ? 'bg-green-600/20 text-green-400' : 'bg-zinc-600/20 text-zinc-500'}`}>
                      {l.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="font-bold text-white text-base">{l.title}</p>
                  <p className="text-xs text-zinc-500">/loja/{l.slug} · {l.checkoutsCount} checkouts · Garantia {l.warrantyDays}d</p>
                </div>

                {/* Perfil de destino */}
                <div className="flex-shrink-0 text-center">
                  {t ? (
                    <div
                      className="rounded-xl px-3 py-2 text-center"
                      style={{ background: t.accentHex + '18', border: `1px solid ${t.accentHex}44` }}
                    >
                      <p className="text-xl">{t.emoji}</p>
                      <p className="text-[10px] font-bold uppercase mt-0.5" style={{ color: t.accentHex }}>
                        {t.label}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl px-3 py-2 bg-zinc-800/50 border border-zinc-700/40 text-center">
                      <p className="text-zinc-600 text-xs">Sem perfil</p>
                    </div>
                  )}
                </div>

                {/* Preço */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-lg font-bold text-white">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(l.pricePerUnit)}
                  </p>
                  <p className="text-xs text-zinc-500">por unidade</p>
                </div>

                {/* Ações */}
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(l)}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(l.id, l.active)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${l.active ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'}`}
                  >
                    {l.active ? 'Pausar' : 'Reativar'}
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

// ─── Helpers de campo ─────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 disabled:opacity-40"
      />
    </div>
  )
}

function FieldNum({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide">{label}</label>
      <input
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
      />
    </div>
  )
}
