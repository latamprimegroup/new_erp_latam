'use client'

/**
 * SubscriptionsAdmin — Gestão de Assinaturas Recorrentes
 *
 * Listagem, criação e gerenciamento do status de todas as assinaturas ativas
 * (SaaS / Mentoria / Infra / Rental) por perfil de cliente.
 */
import { useState, useEffect, useCallback } from 'react'
import { PROFILE_THEMES, PROFILE_TYPE_LABELS } from '@/lib/client-profile-config'
import type { ClientProfileType } from '@/lib/client-profile-config'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type Sub = {
  id:            string
  planName:      string
  profileType:   string
  status:        string
  currency:      string
  amount:        number
  spendFeePct:   number | null
  billingCycle:  string
  gateway:       string
  startedAt:     string
  nextBillingAt: string | null
  cancelledAt:   string | null
  notes:         string | null
  clientId:      string
  clientName:    string
  clientEmail:   string
  clientCode:    string | null
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-green-600/20 text-green-400',
  TRIAL:     'bg-blue-600/20 text-blue-400',
  PAST_DUE:  'bg-red-600/20 text-red-400',
  PAUSED:    'bg-yellow-600/20 text-yellow-400',
  CANCELLED: 'bg-zinc-700/50 text-zinc-500',
}

const CYCLE_LABELS: Record<string, string> = {
  MONTHLY:   'Mensal',
  QUARTERLY: 'Trimestral',
  ANNUAL:    'Anual',
}

const GATEWAY_LABELS: Record<string, string> = {
  INTER:      '🏦 Inter',
  KAST:       '₿ Kast',
  MERCURY:    '🇺🇸 Mercury',
  STRIPE:     '💳 Stripe',
  PIX_MANUAL: '📱 PIX Manual',
  OTHER:      '— Outro',
}

export function SubscriptionsAdmin() {
  const [subs, setSubs]         = useState<Sub[]>([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE')
  const [profileFilter, setProfileFilter] = useState<string>('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const fetchSubs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter)  params.set('status',      statusFilter)
    if (profileFilter) params.set('profileType', profileFilter)
    const res  = await fetch(`/api/admin/subscriptions?${params}`)
    const data = await res.json()
    setSubs(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [statusFilter, profileFilter])

  useEffect(() => { fetchSubs() }, [fetchSubs])

  async function changeStatus(id: string, status: string) {
    setUpdating(id)
    const res = await fetch(`/api/admin/subscriptions/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    })
    if (res.ok) {
      setMsg({ type: 'ok', text: 'Status atualizado.' })
      fetchSubs()
    } else {
      setMsg({ type: 'err', text: 'Falha ao atualizar.' })
    }
    setUpdating(null)
  }

  const mrr = subs
    .filter((s) => s.status === 'ACTIVE' || s.status === 'TRIAL')
    .reduce((acc, s) => {
      const brl = s.currency === 'BRL' ? s.amount : s.amount * 5.2
      const monthly = s.billingCycle === 'ANNUAL'
        ? brl / 12
        : s.billingCycle === 'QUARTERLY' ? brl / 3 : brl
      return acc + monthly
    }, 0)

  const profileOptions = Object.entries(PROFILE_TYPE_LABELS) as [ClientProfileType, string][]

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">🔄 Recorrência & Assinaturas</h1>
          <p className="text-zinc-400 text-sm mt-0.5">SaaS · Mentoria · Infra · Aluguel de Contas</p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700/60 rounded-xl px-4 py-2">
          <span className="text-xs text-zinc-500 uppercase font-bold tracking-wide">MRR</span>
          <span className="text-lg font-black text-amber-400">{BRL.format(mrr)}</span>
          <span className="text-xs text-zinc-600">/mês</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativas</option>
          <option value="TRIAL">Trial</option>
          <option value="PAST_DUE">Em atraso</option>
          <option value="PAUSED">Pausadas</option>
          <option value="CANCELLED">Canceladas</option>
        </select>
        <select
          value={profileFilter}
          onChange={(e) => setProfileFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
        >
          <option value="">Todos os perfis</option>
          {profileOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <a
          href="/dashboard/admin/revenue-8d"
          className="ml-auto rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition"
        >
          🎯 Motor 8D →
        </a>
      </div>

      {msg && (
        <p className={`text-sm font-medium ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
          {msg.text}
        </p>
      )}

      {/* Listagem */}
      {loading ? (
        <p className="text-zinc-500 text-sm animate-pulse">Carregando assinaturas…</p>
      ) : subs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center">
          <p className="text-zinc-500 text-sm">Nenhuma assinatura encontrada.</p>
          <p className="text-zinc-600 text-xs mt-1">Assinaturas são criadas automaticamente pelo Motor de Onboarding quando o produto tem um perfil de destino.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => {
            const theme = PROFILE_THEMES[s.profileType as ClientProfileType]
            const label = PROFILE_TYPE_LABELS[s.profileType as ClientProfileType] ?? s.profileType
            const nextBilling = s.nextBillingAt
              ? new Date(s.nextBillingAt).toLocaleDateString('pt-BR')
              : 'N/A'
            const isUpdating = updating === s.id

            return (
              <div key={s.id} className="rounded-2xl border border-zinc-700/50 bg-zinc-900/70 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Perfil */}
                  <div
                    className="flex items-center gap-2 shrink-0 rounded-xl px-3 py-2"
                    style={{ background: (theme?.accentHex ?? '#6b7280') + '18' }}
                  >
                    <span className="text-xl">{theme?.emoji ?? '📦'}</span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: theme?.accentHex }}>
                        {label}
                      </p>
                      <p className="text-[10px] text-zinc-500">{CYCLE_LABELS[s.billingCycle]}</p>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white text-base">{s.planName}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[s.status] ?? 'bg-zinc-700 text-zinc-400'}`}>
                        {s.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 truncate">
                      {s.clientName} · {s.clientEmail}
                      {s.clientCode ? ` · ${s.clientCode}` : ''}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {GATEWAY_LABELS[s.gateway] ?? s.gateway} · Próx. cobrança: {nextBilling}
                    </p>
                  </div>

                  {/* Valor */}
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-white">
                      {s.currency === 'BRL'
                        ? BRL.format(s.amount)
                        : `$${s.amount.toFixed(2)} USD`}
                    </p>
                    {s.spendFeePct && (
                      <p className="text-xs text-amber-400">+{s.spendFeePct}% spend</p>
                    )}
                    <p className="text-xs text-zinc-600">{CYCLE_LABELS[s.billingCycle]}</p>
                  </div>

                  {/* Ações rápidas */}
                  <div className="flex gap-2 shrink-0">
                    {s.status === 'ACTIVE' && (
                      <button
                        onClick={() => changeStatus(s.id, 'PAUSED')}
                        disabled={isUpdating}
                        className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition"
                      >
                        Pausar
                      </button>
                    )}
                    {(s.status === 'PAUSED' || s.status === 'PAST_DUE') && (
                      <button
                        onClick={() => changeStatus(s.id, 'ACTIVE')}
                        disabled={isUpdating}
                        className="rounded-lg bg-green-600/20 border border-green-600/30 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-600/30 disabled:opacity-40 transition"
                      >
                        Reativar
                      </button>
                    )}
                    {s.status !== 'CANCELLED' && (
                      <button
                        onClick={() => changeStatus(s.id, 'CANCELLED')}
                        disabled={isUpdating}
                        className="rounded-lg bg-red-600/10 border border-red-600/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-600/20 disabled:opacity-40 transition"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
                {s.notes && (
                  <p className="text-xs text-zinc-600 italic border-t border-zinc-800/50 pt-2">{s.notes}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
