'use client'

/**
 * PlansAdmin — Catálogo de Planos de Assinatura
 *
 * Gestão de todos os planos comercializáveis por perfil de cliente.
 * Cada plano define: preço, ciclo, trial, taxa de spend e módulos incluídos.
 */
import { useState, useEffect, useCallback } from 'react'
import { PROFILE_THEMES, PROFILE_TYPE_LABELS } from '@/lib/client-profile-config'
import type { ClientProfileType } from '@/lib/client-profile-config'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

type Plan = {
  id:            string
  slug:          string
  name:          string
  description:   string | null
  profileType:   string
  priceBrl:      number | null
  priceUsd:      number | null
  interval:      string
  trialDays:     number
  spendFeePct:   number | null
  features:      string[]
  active:        boolean
  subscriptions: number
}

const INTERVAL_LABELS: Record<string, string> = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', ANNUAL: 'Anual' }
const EMPTY: Omit<Plan, 'id' | 'subscriptions'> = {
  slug: '', name: '', description: '', profileType: 'TRADER_WHATSAPP',
  priceBrl: null, priceUsd: null, interval: 'MONTHLY', trialDays: 0,
  spendFeePct: null, features: [], active: true,
}

export function PlansAdmin() {
  const [plans, setPlans]     = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [form, setForm]       = useState<typeof EMPTY>(EMPTY)
  const [featInput, setFeatInput] = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/plans')
    setPlans(await r.json().catch(() => []))
    setLoading(false)
  }, [])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  function openEdit(p: Plan) {
    setEditId(p.id); setForm({ ...p }); setShowForm(true); setMsg(null)
  }
  function openCreate() {
    setEditId(null); setForm(EMPTY); setShowForm(true); setMsg(null)
  }

  function addFeature() {
    const f = featInput.trim()
    if (!f) return
    setForm((prev) => ({ ...prev, features: [...prev.features, f] }))
    setFeatInput('')
  }
  function removeFeature(i: number) {
    setForm((prev) => ({ ...prev, features: prev.features.filter((_, idx) => idx !== i) }))
  }

  async function handleSave() {
    setSaving(true); setMsg(null)
    const body = {
      ...form,
      priceBrl:    form.priceBrl   ? Number(form.priceBrl)   : null,
      priceUsd:    form.priceUsd   ? Number(form.priceUsd)   : null,
      spendFeePct: form.spendFeePct ? Number(form.spendFeePct) : null,
      trialDays:   Number(form.trialDays),
    }
    const r = editId
      ? await fetch(`/api/admin/plans/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/admin/plans',             { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { setMsg({ type: 'ok', text: editId ? 'Plano atualizado!' : 'Plano criado!' }); fetchPlans(); if (!editId) { setShowForm(false); setForm(EMPTY) } }
    else { const e = await r.json(); setMsg({ type: 'err', text: e.error ?? 'Erro' }) }
    setSaving(false)
  }

  const profileOptions = Object.entries(PROFILE_TYPE_LABELS) as [ClientProfileType, string][]

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">📋 Catálogo de Planos</h1>
          <p className="text-zinc-400 text-sm mt-0.5">SaaS · Mentoria · Infra · Aluguel — todos os modelos de recorrência</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition">+ Novo Plano</button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
          <h2 className="text-lg font-bold text-white">{editId ? '✏️ Editar Plano' : '➕ Novo Plano'}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <F label="Nome" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Mentoria Elite Mensal" />
            <F label="Slug (URL)" value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v.toLowerCase().replace(/\s/g, '-') }))} placeholder="mentoria-elite-mensal" disabled={!!editId} />
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Descrição</label>
              <textarea value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase">Perfil de Acesso</label>
              <select value={form.profileType} onChange={(e) => setForm((f) => ({ ...f, profileType: e.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500">
                {profileOptions.map(([v, l]) => <option key={v} value={v}>{PROFILE_THEMES[v]?.emoji} {l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase">Ciclo</label>
              <select value={form.interval} onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500">
                {Object.entries(INTERVAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <FNum label="Preço em BRL (R$)" value={form.priceBrl ?? ''} onChange={(v) => setForm((f) => ({ ...f, priceBrl: v ? Number(v) : null }))} />
            <FNum label="Preço em USD ($)" value={form.priceUsd ?? ''} onChange={(v) => setForm((f) => ({ ...f, priceUsd: v ? Number(v) : null }))} />
            <FNum label="Taxa de Spend (%) — Rental/Infra" value={form.spendFeePct ?? ''} onChange={(v) => setForm((f) => ({ ...f, spendFeePct: v ? Number(v) : null }))} />
            <FNum label="Dias de Trial gratuito" value={form.trialDays} onChange={(v) => setForm((f) => ({ ...f, trialDays: Number(v) }))} />

            {/* Features */}
            <div className="sm:col-span-2 space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Recursos Incluídos</label>
              <div className="flex gap-2">
                <input value={featInput} onChange={(e) => setFeatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())} placeholder="Ex: Acesso a mentoria ao vivo" className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
                <button type="button" onClick={addFeature} className="rounded-lg bg-zinc-700 hover:bg-zinc-600 px-3 py-2 text-sm text-white">+</button>
              </div>
              {form.features.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.features.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-violet-600/20 border border-violet-500/30 px-3 py-1 text-xs text-violet-300">
                      ✓ {f}
                      <button onClick={() => removeFeature(i)} className="ml-1 text-violet-500 hover:text-red-400">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {editId && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-zinc-400 uppercase">Ativo</label>
                <button type="button" onClick={() => setForm((f) => ({ ...f, active: !f.active }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${form.active ? 'bg-green-600' : 'bg-zinc-600'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${form.active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )}
          </div>

          {msg && <p className={`text-sm font-medium ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>}

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-violet-600 hover:bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition">
              {saving ? 'Salvando…' : editId ? 'Atualizar' : 'Criar Plano'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de planos */}
      {loading ? (
        <p className="text-zinc-500 text-sm animate-pulse">Carregando planos…</p>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center">
          <p className="text-zinc-500 text-sm">Nenhum plano cadastrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => {
            const theme = PROFILE_THEMES[p.profileType as ClientProfileType]
            return (
              <div key={p.id} className={`rounded-2xl border bg-zinc-900/70 p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${p.active ? 'border-zinc-700/50' : 'border-zinc-800/30 opacity-50'}`}>
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-2xl">{theme?.emoji ?? '📦'}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white">{p.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.active ? 'bg-green-600/20 text-green-400' : 'bg-zinc-700 text-zinc-500'}`}>{p.active ? 'Ativo' : 'Inativo'}</span>
                      {p.trialDays > 0 && <span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-[10px] font-bold text-blue-400">{p.trialDays}d trial</span>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">/{p.slug} · {INTERVAL_LABELS[p.interval]} · {p.subscriptions} assinaturas</p>
                    {p.features.length > 0 && <p className="text-xs text-zinc-600 mt-0.5">{p.features.slice(0, 3).join(' · ')}{p.features.length > 3 ? ` +${p.features.length - 3}` : ''}</p>}
                  </div>
                </div>
                <div className="shrink-0 text-right space-y-0.5">
                  {p.priceBrl && <p className="text-base font-black text-white">{BRL.format(p.priceBrl)}</p>}
                  {p.priceUsd && <p className="text-sm font-bold text-blue-300">{USD.format(p.priceUsd)} USD</p>}
                  {p.spendFeePct && <p className="text-xs text-amber-400">+{p.spendFeePct}% spend</p>}
                </div>
                <button onClick={() => openEdit(p)} className="shrink-0 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition">Editar</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function F({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="text-xs font-bold text-zinc-500 uppercase">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 disabled:opacity-40" />
    </div>
  )
}
function FNum({ label, value, onChange }: { label: string; value: number | string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-bold text-zinc-500 uppercase">{label}</label>
      <input type="number" min={0} step={0.01} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500" />
    </div>
  )
}
