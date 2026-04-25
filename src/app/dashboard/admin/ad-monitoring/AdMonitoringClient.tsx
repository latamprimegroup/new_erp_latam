'use client'

/**
 * AdMonitoringClient — Monitoramento de Spend e Comissões
 *
 * Dashboard para rastrear gastos diários das contas de anúncio
 * de clientes no modelo Rental/Infra e calcular comissões automáticas.
 *
 * Fluxo:
 *  1. Admin registra as contas de cada cliente (plataforma + ID)
 *  2. Diariamente insere o gasto (manual ou futuro sync via API)
 *  3. O sistema calcula a comissão = gasto × taxa% e exibe o total a cobrar
 *  4. Na fechamento mensal, gera Transaction por cliente
 */
import { useState, useEffect, useCallback } from 'react'
import { PROFILE_THEMES, PROFILE_TYPE_LABELS } from '@/lib/client-profile-config'
import type { ClientProfileType } from '@/lib/client-profile-config'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const now  = new Date()
const CUR_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

type Account = {
  id:                string
  platform:          string
  adAccountId:       string
  adAccountName:     string | null
  dailySpendBrl:     number
  monthlySpendBrl:   number
  totalSpendBrl:     number
  commissionRatePct: number
  commissionDueBrl:  number
  lastSyncAt:        string | null
  active:            boolean
  notes:             string | null
  logCount:          number
  client: {
    id:          string
    clientCode:  string | null
    name:        string
    email:       string
    profileType: string
  }
}

type Commission = {
  clientId:      string
  clientName:    string
  clientEmail:   string
  clientCode:    string | null
  profileType:   string
  totalSpendBrl: number
  totalCommBrl:  number
  accounts: Array<{
    platform:          string
    adAccountId:       string
    commissionRatePct: number
    spendBrl:          number
    commBrl:           number
    days:              number
  }>
}

const PLATFORM_EMOJI: Record<string, string> = {
  google_ads: '🎯', meta: '📘', tiktok: '🎵',
  taboola: '📰', outbrain: '🌐', twitter: '🐦', other: '📊',
}

export function AdMonitoringClient() {
  const [tab, setTab]             = useState<'accounts' | 'commissions'>('accounts')
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [commissions, setComm]    = useState<{ grandTotalCommBrl: number; grandTotalSpendBrl: number; clients: Commission[] } | null>(null)
  const [month, setMonth]         = useState(CUR_MONTH)
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [selectedId, setSelected] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Formulário de nova conta
  const [form, setForm] = useState({
    clientId: '', platform: 'google_ads', adAccountId: '', adAccountName: '', commissionRatePct: 10, notes: '',
  })

  // Formulário de entrada de gasto
  const [spendForm, setSpendForm] = useState({ dailySpendBrl: '', date: CUR_MONTH + '-' + String(now.getDate()).padStart(2, '0') })

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/ad-monitoring')
    setAccounts(await r.json().catch(() => []))
    setLoading(false)
  }, [])

  const fetchCommissions = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/ad-monitoring/commissions?month=${month}`)
    setComm(await r.json().catch(() => null))
    setLoading(false)
  }, [month])

  useEffect(() => { tab === 'accounts' ? fetchAccounts() : fetchCommissions() }, [tab, fetchAccounts, fetchCommissions])
  useEffect(() => { if (tab === 'commissions') fetchCommissions() }, [month, tab, fetchCommissions])

  async function addAccount() {
    setSaving(true)
    const r = await fetch('/api/admin/ad-monitoring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, commissionRatePct: Number(form.commissionRatePct) }),
    })
    if (r.ok) { setMsg({ type: 'ok', text: 'Conta adicionada!' }); setShowAdd(false); fetchAccounts() }
    else { const e = await r.json(); setMsg({ type: 'err', text: e.error ?? 'Erro' }) }
    setSaving(false)
  }

  async function registerSpend(id: string) {
    setSaving(true)
    const r = await fetch(`/api/admin/ad-monitoring/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailySpendBrl: Number(spendForm.dailySpendBrl), date: spendForm.date }),
    })
    if (r.ok) { setMsg({ type: 'ok', text: 'Gasto registrado!' }); setSelected(null); fetchAccounts() }
    else setMsg({ type: 'err', text: 'Erro ao registrar gasto' })
    setSaving(false)
  }

  const totalMonthlySpend = accounts.reduce((s, a) => s + a.monthlySpendBrl, 0)
  const totalCommDue      = accounts.reduce((s, a) => s + a.commissionDueBrl, 0)

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">📊 Monitoramento de Spend & Comissões</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Aluguel de Contas · Infra Partner · Cobrança por % sobre gasto</p>
        </div>
        <div className="flex gap-2">
          <a href="/dashboard/admin/revenue-8d" className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition">
            🎯 Motor 8D
          </a>
          <button onClick={() => { setShowAdd(true); setMsg(null) }} className="rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition">
            + Adicionar Conta
          </button>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Contas Monitoradas', value: String(accounts.length), accent: '#a78bfa' },
          { label: 'Spend Mensal Total', value: BRL.format(totalMonthlySpend), accent: '#60a5fa' },
          { label: 'Comissão a Cobrar', value: BRL.format(totalCommDue), accent: '#34d399' },
          { label: 'Média de Taxa', value: accounts.length > 0 ? `${(accounts.reduce((s, a) => s + a.commissionRatePct, 0) / accounts.length).toFixed(1)}%` : '—', accent: '#fbbf24' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{k.label}</p>
            <p className="text-xl font-black mt-1" style={{ color: k.accent }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 self-start w-fit">
        {(['accounts', 'commissions'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t === 'accounts' ? '🖥️ Contas' : '💰 Comissões do Mês'}
          </button>
        ))}
      </div>

      {msg && <p className={`text-sm font-medium ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>}

      {/* Formulário de nova conta */}
      {showAdd && (
        <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
          <h2 className="text-base font-bold text-white">➕ Nova Conta para Monitorar</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase">Client ID (do banco)</label>
              <input value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} placeholder="clidxxxxxxxxx" className="w-full mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase">Plataforma</label>
              <select value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} className="w-full mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500">
                {['google_ads', 'meta', 'tiktok', 'taboola', 'outbrain', 'twitter', 'other'].map((p) => (
                  <option key={p} value={p}>{PLATFORM_EMOJI[p] ?? '📊'} {p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase">ID da Conta</label>
              <input value={form.adAccountId} onChange={(e) => setForm((f) => ({ ...f, adAccountId: e.target.value }))} placeholder="863-498-6283" className="w-full mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase">Nome da Conta</label>
              <input value={form.adAccountName} onChange={(e) => setForm((f) => ({ ...f, adAccountName: e.target.value }))} placeholder="Conta Principal" className="w-full mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase">Taxa de Comissão (%)</label>
              <input type="number" min={0} max={100} step={0.5} value={form.commissionRatePct} onChange={(e) => setForm((f) => ({ ...f, commissionRatePct: Number(e.target.value) }))} className="w-full mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={addAccount} disabled={saving} className="rounded-lg bg-violet-600 hover:bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition">
              {saving ? 'Salvando…' : 'Adicionar'}
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition">Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-zinc-500 text-sm animate-pulse">Carregando dados…</p>
      ) : tab === 'accounts' ? (
        /* ── Lista de contas ── */
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center">
              <p className="text-zinc-500 text-sm">Nenhuma conta monitorada ainda.</p>
            </div>
          ) : accounts.map((a) => {
            const theme = PROFILE_THEMES[a.client.profileType as ClientProfileType]
            const isOpen = selectedId === a.id
            return (
              <div key={a.id} className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Plataforma + conta */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-2xl">{PLATFORM_EMOJI[a.platform] ?? '📊'}</span>
                    <div>
                      <p className="font-bold text-white text-base">{a.adAccountName ?? a.adAccountId}</p>
                      <p className="text-xs text-zinc-500">{a.platform} · {a.adAccountId} · {a.logCount} dias registrados</p>
                      <p className="text-xs text-zinc-600">{a.client.name} · {a.client.email}</p>
                    </div>
                  </div>
                  {/* Perfil */}
                  <div className="shrink-0 rounded-lg px-2 py-1 text-center hidden sm:block" style={{ background: (theme?.accentHex ?? '#6b7280') + '18' }}>
                    <p className="text-xs font-bold" style={{ color: theme?.accentHex }}>{theme?.emoji} {PROFILE_TYPE_LABELS[a.client.profileType as ClientProfileType]}</p>
                  </div>
                  {/* Spend e comissão */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">Mensal: {BRL.format(a.monthlySpendBrl)}</p>
                    <p className="text-xs text-emerald-400">Comissão: {BRL.format(a.commissionDueBrl)} ({a.commissionRatePct}%)</p>
                    <p className="text-xs text-zinc-600">Hoje: {BRL.format(a.dailySpendBrl)}</p>
                  </div>
                  {/* Ações */}
                  <button onClick={() => setSelected(isOpen ? null : a.id)} className="shrink-0 rounded-lg bg-blue-600/20 border border-blue-600/30 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 transition">
                    {isOpen ? 'Fechar' : '+ Gasto'}
                  </button>
                </div>
                {/* Formulário de entrada de gasto */}
                {isOpen && (
                  <div className="border-t border-zinc-800 p-4 bg-zinc-800/30 space-y-3">
                    <p className="text-sm font-semibold text-zinc-300">Registrar Gasto Diário</p>
                    <div className="flex gap-3 items-end">
                      <div>
                        <label className="text-xs text-zinc-500">Data</label>
                        <input type="date" value={spendForm.date} onChange={(e) => setSpendForm((f) => ({ ...f, date: e.target.value }))} className="block mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500">Gasto em BRL</label>
                        <input type="number" min={0} step={0.01} value={spendForm.dailySpendBrl} onChange={(e) => setSpendForm((f) => ({ ...f, dailySpendBrl: e.target.value }))} placeholder="1500.00" className="block mt-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 w-32" />
                      </div>
                      <button onClick={() => registerSpend(a.id)} disabled={saving || !spendForm.dailySpendBrl} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 transition">
                        {saving ? '…' : 'Salvar'}
                      </button>
                    </div>
                    {spendForm.dailySpendBrl && (
                      <p className="text-xs text-emerald-400">
                        Comissão deste dia: {BRL.format(Number(spendForm.dailySpendBrl) * a.commissionRatePct / 100)} ({a.commissionRatePct}%)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ── Comissões do mês ── */
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-400">Mês de referência:</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
          </div>
          {commissions && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-4">
                  <p className="text-xs font-bold uppercase text-zinc-500">Gasto Total do Mês</p>
                  <p className="text-2xl font-black text-blue-400 mt-1">{BRL.format(commissions.grandTotalSpendBrl)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-600/5 p-4">
                  <p className="text-xs font-bold uppercase text-zinc-500">💰 Comissão Total a Cobrar</p>
                  <p className="text-2xl font-black text-emerald-400 mt-1">{BRL.format(commissions.grandTotalCommBrl)}</p>
                </div>
              </div>
              <div className="space-y-3">
                {commissions.clients.length === 0 ? (
                  <p className="text-zinc-500 text-sm text-center py-6">Nenhum gasto registrado em {month}.</p>
                ) : commissions.clients.map((c) => {
                  const theme = PROFILE_THEMES[c.profileType as ClientProfileType]
                  return (
                    <div key={c.clientId} className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{theme?.emoji ?? '👤'}</span>
                          <div>
                            <p className="font-bold text-white">{c.clientName}</p>
                            <p className="text-xs text-zinc-500">{c.clientEmail}{c.clientCode ? ` · ${c.clientCode}` : ''}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-emerald-400">{BRL.format(c.totalCommBrl)}</p>
                          <p className="text-xs text-zinc-500">sobre {BRL.format(c.totalSpendBrl)}</p>
                        </div>
                      </div>
                      <div className="space-y-1.5 pl-9">
                        {c.accounts.map((acc) => (
                          <div key={acc.adAccountId} className="flex items-center justify-between text-xs text-zinc-400">
                            <span>{PLATFORM_EMOJI[acc.platform] ?? '📊'} {acc.adAccountId} · {acc.days}d · {acc.commissionRatePct}%</span>
                            <span className="text-white font-semibold">{BRL.format(acc.commBrl)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
