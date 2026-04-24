'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, CheckCircle2,
  Loader2, Plus, X, RefreshCw, ChevronDown, ChevronUp,
  TrendingDown, DollarSign, BarChart2, Ban, Clock, Star,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Ticket = {
  id: string; ticketNumber: string; status: string; reason: string; reasonDetail: string | null
  withinWarranty: boolean; warrantyDays: number; hoursAfterDelivery: number | null
  isVendorFault: boolean; replacementCost: number | null; vendorCreditAmount: number | null
  extendedWarranty: boolean; openedAt: string; approvedAt: string | null; resolvedAt: string | null
  originalAsset: { adsId: string; displayName: string; category: string } | null
  replacementAsset: { adsId: string; displayName: string } | null
  vendor: { id: string; name: string; rating: number; suspended: boolean } | null
  openedBy: { name: string | null }
  // Campos manuais
  suspendedAccountRaw?: string | null
  replacementAccountRaw?: string | null
  clientCodeRaw?: string | null
  accountTypeRaw?: string | null
}

type VendorQA = {
  id: string; name: string; rating: number; trustScore: number
  suspended: boolean; suspendedReason: string | null; category: string
  totalAssets: number; soldAssets: number; availableAssets: number
  totalRMA: number; vendorFaultRMA: number; rmaRate: number
  avgHoursToFail: number | null; pendingCredits: number; liquidatedCredits: number
  totalWarrantyCost: number; topReason: string | null
  alert: 'BLACKLIST' | 'WARNING' | 'OK'
}

type DRE = {
  period: { year: number; month: number }
  dre: { revenue: number; grossMargin: number; warrantyCost: number; vendorCredits: number; netCost: number; netMargin: number; marginAfterRMA: number }
  allTime: { totalRMA: number; totalWarrantyCost: number; totalVendorCredits: number }
  pendingCredits: { amount: number; count: number }
  vendorBreakdown: { vendorName: string; rmaCount: number; warrantyCost: number; vendorCredits: number }[]
  history: { month: string; warrantyCost: number; count: number }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  OPEN:             { label: 'Aberto',          color: 'text-blue-600',   bg: 'bg-blue-50',   icon: <Clock className="w-3 h-3" /> },
  UNDER_REVIEW:     { label: 'Em Análise',       color: 'text-amber-600',  bg: 'bg-amber-50',  icon: <AlertTriangle className="w-3 h-3" /> },
  APPROVED:         { label: 'Aprovado',         color: 'text-green-600',  bg: 'bg-green-50',  icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECTED:         { label: 'Rejeitado',        color: 'text-red-600',    bg: 'bg-red-50',    icon: <X className="w-3 h-3" /> },
  REPLACEMENT_SENT: { label: 'Reposição Enviada',color: 'text-teal-600',   bg: 'bg-teal-50',   icon: <ShieldCheck className="w-3 h-3" /> },
  CLOSED:           { label: 'Concluído',        color: 'text-zinc-500',   bg: 'bg-zinc-100',  icon: <CheckCircle2 className="w-3 h-3" /> },
  CREDITED:         { label: 'Creditado',        color: 'text-violet-600', bg: 'bg-violet-50', icon: <DollarSign className="w-3 h-3" /> },
}

const REASON_LABELS: Record<string, string> = {
  CHECKPOINT:         '🔒 Checkpoint',
  BAN:                '🚫 Banimento',
  WRONG_PASSWORD:     '🔑 Senha Incorreta',
  ACCOUNT_SUSPENDED:  '⛔ Conta Suspensa',
  QUALITY_ISSUE:      '📉 Qualidade',
  METRICS_ISSUE:      '📊 Métricas',
  OTHER:              '❓ Outro',
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulário de abertura de ticket
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  { value: 'BR_MANUAL',  label: 'BR Manual (G2 Manual)' },
  { value: 'BR_AUTO',    label: 'BR Automática (G2 Auto)' },
  { value: 'USD_AUTO',   label: 'USD Automático' },
  { value: 'EUR_AUTO',   label: 'EURO Automático' },
]

function NewTicketForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [suspendedId,    setSuspendedId]    = useState('')
  const [replacementId,  setReplacementId]  = useState('')
  const [clientCode,     setClientCode]     = useState('')
  const [accountType,    setAccountType]    = useState('BR_MANUAL')
  const [reason,         setReason]         = useState('ACCOUNT_SUSPENDED')
  const [detail,         setDetail]         = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!suspendedId.trim()) { setError('Informe o ID da conta suspensa.'); return }
    setSaving(true); setError('')
    const r = await fetch('/api/rma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suspendedAccountRaw:   suspendedId.trim(),
        replacementAccountRaw: replacementId.trim() || undefined,
        clientCodeRaw:         clientCode.trim() || undefined,
        accountTypeRaw:        accountType,
        reason,
        reasonDetail: detail || undefined,
      }),
    })
    if (r.ok) { onSaved() }
    else {
      const j = await r.json()
      setError(j.error ?? 'Erro ao abrir ticket')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card shadow-lg p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base text-zinc-800 dark:text-zinc-100">🛡️ Registrar Troca / Reposição</h3>
        <button type="button" onClick={onCancel} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 font-semibold bg-red-50 dark:bg-red-950/20 border border-red-200 px-3 py-2 rounded-lg">
          ⚠️ {error}
        </p>
      )}

      {/* Grid de campos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* ID da Conta Suspensa */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
            🔴 ID da Conta Suspensa <span className="text-red-500">*</span>
          </label>
          <input
            value={suspendedId}
            onChange={(e) => setSuspendedId(e.target.value)}
            placeholder="Ex: 603-322-2709 ou AA-G21-100"
            className="input-field w-full font-mono text-sm"
            required
          />
        </div>

        {/* Tipo de Conta */}
        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Tipo de Conta</label>
          <select value={accountType} onChange={(e) => setAccountType(e.target.value)} className="input-field w-full text-sm">
            {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Código do Cliente */}
        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Código do Cliente</label>
          <input
            value={clientCode}
            onChange={(e) => setClientCode(e.target.value.toUpperCase())}
            placeholder="Ex: C273"
            className="input-field w-full font-mono text-sm"
          />
        </div>

        {/* Motivo da Suspensão */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Motivo da Suspensão</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="input-field w-full text-sm">
            {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Detalhes */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">Detalhes (opcional)</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
            placeholder="Descreva o problema..."
            className="input-field w-full text-sm resize-none"
          />
        </div>

        {/* ID da Conta Reposta */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
            🟢 ID da Conta Reposta <span className="text-zinc-400 font-normal">(opcional — preencha após enviar)</span>
          </label>
          <input
            value={replacementId}
            onChange={(e) => setReplacementId(e.target.value)}
            placeholder="Ex: 712-400-1234 ou AA-G21-101"
            className="input-field w-full font-mono text-sm"
          />
        </div>
      </div>

      {/* Botões */}
      <div className="flex justify-end gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancelar</button>
        <button
          type="submit"
          disabled={saving || !suspendedId.trim()}
          className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '🛡️'}
          {saving ? 'Registrando...' : 'Registrar Troca'}
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Card de Ticket
// ─────────────────────────────────────────────────────────────────────────────

function TicketCard({ ticket, onAction, producerView = false }: { ticket: Ticket; onAction: () => void; producerView?: boolean }) {
  const [open, setOpen] = useState(false)
  const [acting, setAct] = useState(false)
  const sc = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.OPEN

  const act = async (action: string) => {
    setAct(true)
    await fetch(`/api/rma/${ticket.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setAct(false); onAction()
  }

  return (
    <div className={`rounded-xl border ${ticket.withinWarranty ? 'border-zinc-100 dark:border-zinc-700' : 'border-amber-200'} bg-white dark:bg-ads-dark-card overflow-hidden`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 text-left flex items-center gap-3">
        <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${sc.bg} ${sc.color}`}>
          {sc.icon}{sc.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-zinc-400">{ticket.ticketNumber}</p>
          <p className="text-sm font-bold truncate">
            {ticket.originalAsset?.displayName ?? ticket.suspendedAccountRaw ?? '—'}
          </p>
          {ticket.clientCodeRaw && (
            <p className="text-[10px] text-zinc-400 font-mono">Cliente: {ticket.clientCodeRaw}</p>
          )}
        </div>
        <div className="text-right shrink-0 text-xs">
          <p className="text-zinc-400">{REASON_LABELS[ticket.reason]}</p>
          {ticket.accountTypeRaw && (
            <p className="text-[10px] font-mono text-zinc-500">{ticket.accountTypeRaw.replace('_', ' ')}</p>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-300 shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-300 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-50 dark:border-zinc-800 pt-3">
          <div className="grid sm:grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-zinc-400">🔴 Conta Suspensa:</span>
              <p className="font-mono font-bold">{ticket.originalAsset?.adsId ?? ticket.suspendedAccountRaw ?? '—'}</p>
            </div>
            {ticket.replacementAccountRaw && (
              <div>
                <span className="text-zinc-400">🟢 Conta Reposta:</span>
                <p className="font-mono font-bold">{ticket.replacementAccountRaw}</p>
              </div>
            )}
            {ticket.clientCodeRaw && (
              <div><span className="text-zinc-400">Cliente:</span><p className="font-bold font-mono">{ticket.clientCodeRaw}</p></div>
            )}
            {ticket.accountTypeRaw && (
              <div><span className="text-zinc-400">Tipo:</span><p className="font-bold">{ticket.accountTypeRaw.replace('_', ' ')}</p></div>
            )}
            {!producerView && ticket.vendor && <div><span className="text-zinc-400">Fornecedor:</span><p className="font-bold">{ticket.vendor?.name}</p></div>}
            {!producerView && <div><span className="text-zinc-400">Culpa do Fornecedor:</span><p className={`font-bold ${ticket.isVendorFault ? 'text-red-600' : 'text-amber-600'}`}>{ticket.isVendorFault ? 'Sim' : 'Não (analisar)'}</p></div>}
            {ticket.hoursAfterDelivery != null && <div><span className="text-zinc-400">Tempo até falha:</span><p className="font-bold">{ticket.hoursAfterDelivery}h após entrega</p></div>}
            {!producerView && ticket.replacementCost != null && <div><span className="text-zinc-400">Custo da Reposição:</span><p className="font-bold text-red-600">{BRL(ticket.replacementCost)}</p></div>}
            {!producerView && ticket.vendorCreditAmount != null && ticket.vendorCreditAmount > 0 && <div><span className="text-zinc-400">Crédito vs Fornecedor:</span><p className="font-bold text-green-600">{BRL(ticket.vendorCreditAmount)}</p></div>}
          </div>

          {ticket.replacementAsset && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950/10 border border-green-200 px-3 py-2 text-xs">
              <p className="font-bold text-green-700">
                {producerView ? '✅ Reposição em andamento' : `Reposição reservada: ${ticket.replacementAsset.adsId} — ${ticket.replacementAsset.displayName}`}
              </p>
            </div>
          )}

          {ticket.reasonDetail && <p className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 rounded-lg">{ticket.reasonDetail}</p>}

          {/* Produtor vê só status — ações de aprovação são exclusivas de Compras/Admin */}
          {producerView ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>
                {ticket.status === 'OPEN' && 'Ticket aberto — aguardando análise do setor de Compras'}
                {ticket.status === 'UNDER_REVIEW' && '🔍 Em análise pelo Admin'}
                {ticket.status === 'APPROVED' && '✅ Aprovado — reposição sendo processada'}
                {ticket.status === 'REPLACEMENT_SENT' && '🚀 Reposição enviada ao cliente'}
                {ticket.status === 'CLOSED' && '✔️ Ticket encerrado'}
                {ticket.status === 'REJECTED' && '❌ Ticket rejeitado — entre em contato com o Admin'}
                {ticket.status === 'CREDITED' && '💰 Creditado ao fornecedor'}
              </span>
            </div>
          ) : (
            /* Ações por status — apenas Compras/Admin */
            <div className="flex gap-2 flex-wrap">
              {ticket.status === 'OPEN' && (
                <>
                  <button onClick={() => act('APPROVE')} disabled={acting} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                    {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}Aprovar Troca
                  </button>
                  <button onClick={() => act('REJECT')} disabled={acting} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 text-red-600">
                    <X className="w-3 h-3" />Rejeitar
                  </button>
                </>
              )}
              {ticket.status === 'UNDER_REVIEW' && (
                <>
                  <button onClick={() => act('APPROVE')} disabled={acting} className="btn-primary text-xs px-3 py-1.5">Aprovar (Admin)</button>
                  <button onClick={() => act('REJECT')} disabled={acting} className="btn-secondary text-xs px-3 py-1.5 text-red-600">Rejeitar</button>
                </>
              )}
              {ticket.status === 'APPROVED' && (
                <button onClick={() => act('SEND_REPLACEMENT')} disabled={acting} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />Marcar Reposição Enviada
                </button>
              )}
              {ticket.status === 'REPLACEMENT_SENT' && (
                <button onClick={() => act('CLOSE')} disabled={acting} className="btn-secondary text-xs px-3 py-1.5">Fechar Ticket</button>
              )}
              {ticket.status === 'CLOSED' && ticket.isVendorFault && (
                <button onClick={() => act('CREDIT')} disabled={acting} className="text-xs px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 font-bold">
                  <DollarSign className="w-3 h-3 inline mr-1" />Emitir Crédito vs Fornecedor
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// QA Dashboard de Fornecedores
// ─────────────────────────────────────────────────────────────────────────────

function VendorQAPanel() {
  const [data, setData] = useState<{ vendors: VendorQA[]; summary: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/rma/vendor-qa')
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
  if (!data) return null

  const { vendors, summary } = data

  const alertColor = (a: string) => a === 'BLACKLIST' ? 'bg-red-50 border-red-300 dark:bg-red-950/10' : a === 'WARNING' ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/10' : 'bg-white dark:bg-ads-dark-card border-zinc-100 dark:border-zinc-700'
  const rateColor  = (r: number) => r >= 30 ? 'text-red-600 font-black' : r >= 10 ? 'text-amber-600 font-bold' : 'text-green-600 font-bold'

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Fornecedores',    val: summary.totalVendors,         icon: <Star className="w-4 h-4" />,          color: 'text-zinc-600' },
          { label: 'Suspensos',       val: summary.suspendedVendors,     icon: <Ban className="w-4 h-4" />,           color: 'text-red-600' },
          { label: 'Em Alerta',       val: summary.vendorsInAlert,       icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-600' },
          { label: 'Créditos Pend.',  val: BRL(summary.totalPendingCredits ?? 0), icon: <DollarSign className="w-4 h-4" />, color: 'text-violet-600' },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3 text-center">
            <div className={`flex justify-center mb-1 ${k.color}`}>{k.icon}</div>
            <p className={`text-xl font-black ${k.color}`}>{k.val}</p>
            <p className="text-[10px] text-zinc-400">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Lista de fornecedores */}
      <div className="space-y-2">
        {vendors.map((v) => (
          <div key={v.id} className={`rounded-xl border ${alertColor(v.alert)} p-4`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {v.alert === 'BLACKLIST' && <ShieldX className="w-5 h-5 text-red-500 shrink-0" />}
                {v.alert === 'WARNING'   && <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />}
                {v.alert === 'OK'        && <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />}
                <div>
                  <p className="font-bold text-sm">{v.name}</p>
                  <p className="text-xs text-zinc-400">{v.category} · Rating: {v.rating}/10 · Trust Score: <span className={v.trustScore >= 8 ? 'text-green-600' : v.trustScore >= 5 ? 'text-amber-600' : 'text-red-600'}>{v.trustScore}/10</span></p>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap text-center text-xs">
                <div><p className={`text-lg ${rateColor(v.rmaRate)}`}>{v.rmaRate.toFixed(1)}%</p><p className="text-zinc-400">Taxa RMA</p></div>
                <div><p className="text-lg font-bold">{v.totalAssets}</p><p className="text-zinc-400">Total Ativos</p></div>
                <div><p className="text-lg font-bold text-red-600">{v.vendorFaultRMA}</p><p className="text-zinc-400">Culpa Vendor</p></div>
                {v.pendingCredits > 0 && <div><p className="text-lg font-bold text-violet-600">{BRL(v.pendingCredits)}</p><p className="text-zinc-400">Crédito Pend.</p></div>}
                {v.avgHoursToFail != null && <div><p className="text-lg font-bold">{Math.round(v.avgHoursToFail)}h</p><p className="text-zinc-400">Vida Média</p></div>}
              </div>
            </div>
            {v.suspended && (
              <div className="mt-2 text-xs text-red-700 bg-red-100 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                <Ban className="w-3 h-3" /><span><strong>SUSPENSO:</strong> {v.suspendedReason}</span>
              </div>
            )}
            {v.alert === 'WARNING' && !v.suspended && (
              <p className="mt-2 text-xs text-amber-700 font-semibold">⚠️ ALFREDO IA: Taxa de RMA acima de 10%. Recomendo auditoria antes de novos pedidos.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel DRE de Garantia
// ─────────────────────────────────────────────────────────────────────────────

function DREPanel() {
  const [dre, setDre] = useState<DRE | null>(null)
  const [loading, setLoading] = useState(true)
  const now = new Date()

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/rma/dre?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
    if (r.ok) setDre(await r.json())
    setLoading(false)
  }, [now.getFullYear(), now.getMonth()])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
  if (!dre) return null

  const { dre: d, allTime, pendingCredits, vendorBreakdown, history } = dre
  const maxBar = Math.max(...history.map((h) => h.warrantyCost), 1)

  return (
    <div className="space-y-4">
      {/* Impacto no DRE do mês */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" />Custo de Garantia — {now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Custo de Garantia (bruto)',  val: BRL(d.warrantyCost),  color: 'text-red-600'    },
            { label: 'Créditos vs Fornecedores',   val: BRL(d.vendorCredits), color: 'text-green-600'  },
            { label: 'Custo Líquido Real',          val: BRL(d.netCost),       color: d.netCost > 0 ? 'text-red-500' : 'text-green-600' },
            { label: 'Margem após Garantia',        val: `${d.marginAfterRMA.toFixed(1)}%`, color: d.marginAfterRMA > 50 ? 'text-green-600' : 'text-amber-600' },
          ].map((m) => (
            <div key={m.label} className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <p className={`text-xl font-black ${m.color}`}>{m.val}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Créditos pendentes com fornecedores */}
      {pendingCredits.amount > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/10 p-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-violet-600 shrink-0" />
            <div>
              <p className="font-bold text-violet-800 dark:text-violet-300">Créditos Pendentes com Fornecedores</p>
              <p className="text-sm text-violet-700">{pendingCredits.count} RMA(s) sem crédito emitido · Total: <strong>{BRL(pendingCredits.amount)}</strong></p>
              <p className="text-xs text-violet-500 mt-0.5">Descontar no próximo pedido de compra de cada fornecedor.</p>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown por fornecedor */}
      {vendorBreakdown.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4 space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase">Custo de Garantia por Fornecedor (mês)</p>
          {vendorBreakdown.map((v) => (
            <div key={v.vendorName} className="flex items-center gap-3 text-xs">
              <p className="flex-1 font-medium">{v.vendorName}</p>
              <p className="text-red-600 font-bold w-24 text-right">{BRL(v.warrantyCost)}</p>
              <p className="text-green-600 w-24 text-right">crédito: {BRL(v.vendorCredits)}</p>
              <p className="text-zinc-400 w-10 text-right">{v.rmaCount} RMA</p>
            </div>
          ))}
        </div>
      )}

      {/* Sparkline histórico */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
        <p className="text-xs font-bold text-zinc-500 uppercase mb-3">Histórico de Custo de Garantia (6 meses)</p>
        <div className="flex items-end gap-1.5 h-14">
          {history.map((h) => {
            const hPx = Math.max(3, Math.round((h.warrantyCost / maxBar) * 56))
            return (
              <div key={h.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-red-400 rounded-t-sm" style={{ height: `${hPx}px` }} title={BRL(h.warrantyCost)} />
                <p className="text-[9px] text-zinc-400">{h.month}</p>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-zinc-500">
          <span>Total all-time: <strong className="text-red-600">{BRL(allTime.totalWarrantyCost)}</strong></span>
          <span>Recuperado: <strong className="text-green-600">{BRL(allTime.totalVendorCredits)}</strong></span>
          <span>RMAs: <strong>{allTime.totalRMA}</strong></span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component Principal
// ─────────────────────────────────────────────────────────────────────────────

type SubTab = 'tickets' | 'qa' | 'dre'

const PRODUCER_ROLES = ['PRODUCER', 'PRODUCTION_MANAGER']

export function RMATab({ userRole }: { userRole: string }) {
  const isProducerView = PRODUCER_ROLES.includes(userRole)
  const [subTab, setSubTab] = useState<SubTab>('tickets')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  const loadTickets = useCallback(async () => {
    setLoading(true)
    const params = filterStatus ? `?status=${filterStatus}` : ''
    const r = await fetch(`/api/rma${params}`)
    if (r.ok) { const j = await r.json(); setTickets(j.tickets ?? []) }
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { if (subTab === 'tickets') loadTickets() }, [subTab, loadTickets])

  // Produtores só vêem tickets — QA e DRE são exclusivos de Compras/Admin
  const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'tickets', label: 'Tickets de Troca',       icon: <ShieldAlert className="w-3.5 h-3.5" /> },
    ...(!isProducerView ? [
      { id: 'qa'  as SubTab, label: 'QA de Fornecedores', icon: <BarChart2 className="w-3.5 h-3.5" /> },
      { id: 'dre' as SubTab, label: 'Impacto DRE',        icon: <TrendingDown className="w-3.5 h-3.5" /> },
    ] : []),
  ]

  const openTickets   = tickets.filter((t) => ['OPEN', 'UNDER_REVIEW', 'APPROVED'].includes(t.status)).length
  const pendingTotal  = tickets.filter((t) => t.status === 'CLOSED' && t.isVendorFault && t.vendorCreditAmount && Number(t.vendorCreditAmount) > 0).reduce((s, t) => s + Number(t.vendorCreditAmount), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-black text-lg flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-primary-500" />RMA — Trocas e Garantia Inteligente</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Sistema de reposição com QA de fornecedores e impacto no DRE</p>
        </div>
        <div className="flex gap-2">
          {openTickets > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold">{openTickets} aberto{openTickets > 1 ? 's' : ''}</span>
          )}
          {pendingTotal > 0 && !isProducerView && (
            <span className="px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold">{BRL(pendingTotal)} em créditos</span>
          )}
          {subTab === 'tickets' && (
            <button onClick={() => setShowForm((v) => !v)} className="btn-primary text-sm flex items-center gap-1.5 px-4">
              <Plus className="w-4 h-4" />Nova Troca
            </button>
          )}
        </div>
      </div>

      {/* Sub-abas */}
      <div className="flex gap-1 border-b border-zinc-100 dark:border-zinc-800">
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${subTab === t.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {subTab === 'tickets' && (
        <div className="space-y-4">
          {showForm && <NewTicketForm onSaved={() => { setShowForm(false); loadTickets() }} onCancel={() => setShowForm(false)} />}

          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            {['', 'OPEN', 'UNDER_REVIEW', 'APPROVED', 'REPLACEMENT_SENT', 'CLOSED', 'CREDITED', 'REJECTED'].map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filterStatus === s ? 'bg-primary-600 text-white border-primary-600' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50'}`}>
                {s === '' ? 'Todos' : STATUS_CONFIG[s]?.label ?? s}
              </button>
            ))}
            <button onClick={loadTickets} className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50">
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-green-400" />
              <p className="font-bold">Nenhum ticket de RMA</p>
              <p className="text-sm">Ótimo sinal — zero trocas pendentes!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => <TicketCard key={t.id} ticket={t} onAction={loadTickets} producerView={isProducerView} />)}
            </div>
          )}
        </div>
      )}

      {subTab === 'qa'  && <VendorQAPanel />}
      {subTab === 'dre' && <DREPanel />}
    </div>
  )
}
