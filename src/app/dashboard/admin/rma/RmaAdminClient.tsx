'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw,
  Loader2,
  ShieldAlert,
  BarChart3,
  ClipboardList,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
} from 'lucide-react'
import { RMA_ACTION_LABELS, RMA_REASON_LABELS, warrantyStatus } from '@/lib/rma'
import type { AccountRmaActionTaken, AccountRmaReason, AccountRmaStatus } from '@prisma/client'

// ─── Tipos ─────────────────────────────────────────────────────────────────

type RmaItem = {
  id: string
  status: AccountRmaStatus
  reason: AccountRmaReason
  actionTaken: AccountRmaActionTaken
  openedAt: string
  resolvedAt: string | null
  resolutionMinutes: number | null
  warrantyHours: number | null
  warrantyExpiresAt: string | null
  abuseFlag: boolean
  autoMessageSentAt: string | null
  reasonDetail: string | null
  additionalComments: string | null
  evidenceUrls: string[]
  originalAccount: { id: string; googleAdsCustomerId: string | null; platform: string; deliveredAt: string | null }
  replacementAccount: { id: string; googleAdsCustomerId: string | null } | null
  client: { id: string; user: { name: string | null; email: string | null } }
  assignedTo: { id: string; name: string | null; email: string | null } | null
}

type AnalyticsData = {
  period: string
  totalRmas: number
  totalOrders: number
  replacementRate: number
  avgResolutionMinutes: number
  topReasons: { reason: string; label: string; count: number; percent: number }[]
  actionStats: { action: string; label: string; count: number }[]
  statusStats: { status: string; count: number }[]
  byProducer: { id: string; name: string | null; email: string; rmas: number }[]
  ltvData: {
    clientId: string; name: string; grossLtv: number
    rmaCount: number; orderCount: number; rmaRate: number; isAbuse: boolean
  }[]
  abuseFlagCount: number
}

type AbuseData = {
  suspects: {
    clientId: string; name: string; email: string | null
    rmaCount: number; orderCount: number; rmaRate: number
    grossLtv: number; isAbuse: boolean; alreadyFlagged: boolean
    recentRmas: { id: string; reason: string; actionTaken: string; status: string }[]
  }[]
  threshold: number
}

// ─── Status labels / colors ─────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  EM_ANALISE: 'Em análise',
  EM_REPOSICAO: 'Em reposição',
  CONCLUIDO: 'Concluído',
  NEGADO_TERMO: 'Negado',
}

const STATUS_COLORS: Record<string, string> = {
  EM_ANALISE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  EM_REPOSICAO: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  CONCLUIDO: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  NEGADO_TERMO: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

// ─── Componentes auxiliares ────────────────────────────────────────────────

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      {text}
    </span>
  )
}

function WarrantyBadge({ warrantyHours, deliveredAt }: { warrantyHours: number | null; deliveredAt: string | null }) {
  const ws = warrantyStatus(warrantyHours, deliveredAt)
  if (ws === 'NO_WARRANTY') return <span className="text-zinc-400 text-xs">Sem prazo</span>
  return ws === 'VALID'
    ? <Badge text="✓ No Prazo" color="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" />
    : <Badge text="✗ Expirada" color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" />
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary-600 dark:text-primary-400' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="card p-4 space-y-1">
      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs font-medium uppercase tracking-wide">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-400">{sub}</p>}
    </div>
  )
}

// ─── Modal: Novo RMA ───────────────────────────────────────────────────────

type ClientOption = { id: string; name: string | null; email: string | null }
type AccountOption = { id: string; googleAdsCustomerId: string | null; platform: string }

function NovoRmaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientId, setClientId] = useState('')
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [originalAccountId, setOriginalAccountId] = useState('')
  const [reason, setReason] = useState<AccountRmaReason | ''>('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [warrantyHours, setWarrantyHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/rma/form-data')
      .then((r) => r.json())
      .then((d) => setClients(Array.isArray(d.clients) ? d.clients : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!clientId) { setAccounts([]); return }
    fetch(`/api/admin/rma/form-data?clientId=${clientId}`)
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d.accounts) ? d.accounts : []))
      .catch(() => setAccounts([]))
  }, [clientId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId || !originalAccountId || !reason) {
      setError('Preencha cliente, conta e motivo.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/rma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, originalAccountId, reason, reasonDetail, warrantyHours: warrantyHours || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erro ao criar RMA'); return }
      onCreated()
      onClose()
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-700">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-violet-500" /> Abrir Ticket de Reposição
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Cliente</label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setOriginalAccountId('') }}
              className="input-field text-sm py-2 w-full"
              required
            >
              <option value="">— Selecione o cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Conta Original</label>
            <select
              value={originalAccountId}
              onChange={(e) => setOriginalAccountId(e.target.value)}
              className="input-field text-sm py-2 w-full"
              required
              disabled={!clientId}
            >
              <option value="">— Selecione a conta —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.googleAdsCustomerId || a.id.slice(0, 10)} — {a.platform}
                </option>
              ))}
            </select>
            {clientId && accounts.length === 0 && (
              <p className="text-xs text-zinc-400 mt-1">Nenhuma conta entregue encontrada para este cliente.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Motivo da Queda</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as AccountRmaReason)}
              className="input-field text-sm py-2 w-full"
              required
            >
              <option value="">— Selecione o motivo —</option>
              {(Object.entries(RMA_REASON_LABELS) as [AccountRmaReason, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Detalhes (opcional)</label>
            <textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              className="input-field text-sm py-2 w-full resize-none"
              rows={2}
              placeholder="Descreva o problema..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 block">Prazo de Garantia (horas)</label>
            <input
              type="number"
              value={warrantyHours}
              onChange={(e) => setWarrantyHours(e.target.value)}
              className="input-field text-sm py-2 w-32"
              min={1}
              placeholder="Ex: 72"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-5 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Abrir Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Aba 1: Fila de RMA ────────────────────────────────────────────────────

function QueueTab() {
  const [items, setItems] = useState<RmaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<RmaItem | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [patching, setPatching] = useState(false)
  const [availableAccounts, setAvailableAccounts] = useState<{ id: string; googleAdsCustomerId: string | null }[]>([])
  const [showNovoRma, setShowNovoRma] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const qs = filterStatus ? `?status=${filterStatus}` : ''
    fetch(`/api/admin/rma${qs}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  // Busca contas disponíveis quando seleciona um RMA
  useEffect(() => {
    if (!selected) { setAvailableAccounts([]); return }
    fetch('/api/estoque/disponivel?limit=50')
      .then((r) => r.json())
      .then((d) => setAvailableAccounts(Array.isArray(d.items) ? d.items : []))
      .catch(() => setAvailableAccounts([]))
  }, [selected])

  async function patch(partial: Record<string, unknown>) {
    if (!selected) return
    setPatching(true)
    try {
      const res = await fetch(`/api/admin/rma/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro'); return }
      setSelected(data)
      load()
    } finally {
      setPatching(false)
    }
  }

  const openCount = items.filter((i) => ['EM_ANALISE', 'EM_REPOSICAO'].includes(i.status)).length

  return (
    <div className="space-y-4">
      {showNovoRma && (
        <NovoRmaModal
          onClose={() => setShowNovoRma(false)}
          onCreated={() => { load(); setShowNovoRma(false) }}
        />
      )}
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowNovoRma(true)}
          className="btn-primary flex items-center gap-2 text-sm py-1.5 px-4"
        >
          <Plus className="w-4 h-4" /> Novo Ticket RMA
        </button>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input-field text-sm py-1.5 w-44"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
        <span className="text-sm text-zinc-500">
          Em aberto: <strong className="text-amber-600 dark:text-amber-400">{openCount}</strong>
        </span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Tabela */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">Nenhum RMA encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Cliente / Conta</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Garantia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${selected?.id === r.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                  >
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">
                        {r.client.user?.name || r.client.user?.email}
                      </p>
                      <p className="text-xs text-zinc-400 font-mono">
                        {r.originalAccount?.googleAdsCustomerId || r.originalAccount?.id?.slice(0, 10)}
                      </p>
                      {r.abuseFlag && (
                        <span className="text-[10px] text-red-500 font-semibold">⚠ Abuso</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <Badge text={STATUS_LABELS[r.status] ?? r.status} color={STATUS_COLORS[r.status] ?? ''} />
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {RMA_REASON_LABELS[r.reason] ?? r.reason}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <WarrantyBadge
                        warrantyHours={r.warrantyHours}
                        deliveredAt={r.originalAccount.deliveredAt}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detalhe / Ações */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
          {!selected ? (
            <p className="text-sm text-zinc-500">Selecione um RMA para ver detalhes e agir.</p>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Detalhes do RMA</h3>
                  {selected.abuseFlag && (
                    <Badge text="⚠ Abuso Sinalizado" color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" />
                  )}
                </div>
                <p className="text-xs text-zinc-400 font-mono">{selected.id}</p>
              </div>

              {/* Garantia */}
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Diagnóstico de Garantia</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600 dark:text-zinc-300">Status</span>
                  <WarrantyBadge warrantyHours={selected.warrantyHours} deliveredAt={selected.originalAccount.deliveredAt} />
                </div>
                {selected.originalAccount.deliveredAt && (
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Data compra</span>
                    <span>{new Date(selected.originalAccount.deliveredAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500">Prazo (horas)</label>
                  <input
                    type="number"
                    defaultValue={selected.warrantyHours ?? ''}
                    className="input-field text-xs py-1 w-20"
                    min={1}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v) && v > 0) patch({ warrantyHours: v })
                    }}
                  />
                </div>
              </div>

              {/* Motivo e Ação */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Motivo da Queda</label>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {RMA_REASON_LABELS[selected.reason] ?? selected.reason}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Ação Tomada</label>
                  <select
                    value={selected.actionTaken}
                    disabled={patching}
                    onChange={(e) => patch({ actionTaken: e.target.value })}
                    className="input-field text-sm py-1 w-full"
                  >
                    {Object.entries(RMA_ACTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Conta substituta */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Conta Substituta</label>
                <select
                  value={selected.replacementAccount?.id ?? ''}
                  disabled={patching}
                  onChange={(e) => patch({ replacementAccountId: e.target.value || null })}
                  className="input-field text-sm py-1 w-full"
                >
                  <option value="">— Sem conta substituta —</option>
                  {selected.replacementAccount && (
                    <option value={selected.replacementAccount.id}>
                      ✓ Atual: {selected.replacementAccount.googleAdsCustomerId}
                    </option>
                  )}
                  {availableAccounts
                    .filter((a) => a.id !== selected.replacementAccount?.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.googleAdsCustomerId || a.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Status do Ticket</label>
                <select
                  value={selected.status}
                  disabled={patching}
                  onChange={(e) => patch({ status: e.target.value })}
                  className="input-field text-sm py-1 w-full"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {selected.autoMessageSentAt && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  ✓ Auto-mensagem enviada em {new Date(selected.autoMessageSentAt).toLocaleString('pt-BR')}
                </p>
              )}

              {patching && (
                <div className="flex items-center gap-2 text-zinc-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Salvando…
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Aba 2: Analytics CEO ──────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLtv, setShowLtv] = useState(false)

  useEffect(() => {
    fetch('/api/admin/rma/analytics')
      .then((r) => r.json())
      .then(setData)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando analytics…
      </div>
    )
  }
  if (!data) return <p className="text-zinc-500 text-sm">Erro ao carregar dados.</p>

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ClipboardList}
          label="Total RMAs (90d)"
          value={data.totalRmas}
          sub={`${data.totalOrders} pedidos no período`}
        />
        <StatCard
          icon={TrendingUp}
          label="Taxa de Reposição"
          value={`${data.replacementRate}%`}
          sub="RMAs / Pedidos"
          color={data.replacementRate > 15 ? 'text-red-600' : 'text-green-600 dark:text-green-400'}
        />
        <StatCard
          icon={Clock}
          label="SLA Médio"
          value={`${data.avgResolutionMinutes} min`}
          sub="Tempo médio de resolução"
        />
        <StatCard
          icon={ShieldAlert}
          label="Flags de Abuso"
          value={data.abuseFlagCount}
          sub="Clientes marcados"
          color={data.abuseFlagCount > 0 ? 'text-red-600' : 'text-zinc-500'}
        />
      </div>

      {/* Top Motivos + Ações */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-500" /> Top Motivos de Queda
          </h3>
          <div className="space-y-3">
            {data.topReasons.map((r) => (
              <div key={r.reason}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-zinc-700 dark:text-zinc-300">{r.label}</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {r.count} ({r.percent}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary-500 dark:bg-primary-400 transition-all"
                    style={{ width: `${r.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" /> Ações Tomadas
          </h3>
          <div className="space-y-2">
            {data.actionStats.map((a) => (
              <div key={a.action} className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{a.label}</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{a.count}</span>
              </div>
            ))}
          </div>

          <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mt-4 mb-3">Status Atual</h3>
          <div className="space-y-1">
            {data.statusStats.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <Badge text={STATUS_LABELS[s.status] ?? s.status} color={STATUS_COLORS[s.status] ?? ''} />
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Por Produtor */}
      {data.byProducer.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" /> Taxa de RMA por Produtor (G2)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 dark:border-zinc-700">
                <tr>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Produtor</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">RMAs</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Qualidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.byProducer.map((p, i) => {
                  const maxRmas = data.byProducer[0]?.rmas ?? 1
                  const quality = Math.max(0, 100 - Math.round((p.rmas / maxRmas) * 100))
                  return (
                    <tr key={p.id}>
                      <td className="py-2 px-3">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">{p.name || p.email}</p>
                        <p className="text-xs text-zinc-400">{p.email}</p>
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-zinc-900 dark:text-zinc-100">
                        {p.rmas}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${quality >= 70 ? 'bg-green-500' : quality >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${quality}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold ${quality >= 70 ? 'text-green-600' : quality >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                            {quality}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LTV Ajustado */}
      {data.ltvData.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowLtv((v) => !v)}
            className="flex items-center justify-between w-full font-semibold text-zinc-800 dark:text-zinc-200"
          >
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary-500" /> LTV Ajustado por Cliente (RMA)
            </span>
            {showLtv ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showLtv && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Cliente</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">LTV Bruto</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">RMAs</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Taxa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {data.ltvData.map((c) => (
                    <tr key={c.clientId} className={c.isAbuse ? 'bg-red-50/50 dark:bg-red-950/20' : ''}>
                      <td className="py-2 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                        {c.name}
                        {c.isAbuse && <span className="ml-2 text-[10px] text-red-500 font-bold">ABUSO</span>}
                      </td>
                      <td className="py-2 px-3 text-right text-zinc-700 dark:text-zinc-300">
                        {c.grossLtv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2 px-3 text-right">{c.rmaCount}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${c.rmaRate > 30 ? 'text-red-600' : c.rmaRate > 15 ? 'text-amber-600' : 'text-green-600'}`}>
                        {c.rmaRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Aba 3: Alertas de Abuso ───────────────────────────────────────────────

function AbusosTab() {
  const [data, setData] = useState<AbuseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [flagging, setFlagging] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/rma/abusos')
      .then((r) => r.json())
      .then(setData)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleFlag(clientId: string, flag: boolean) {
    setFlagging(clientId)
    try {
      await fetch('/api/admin/rma/abusos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, flag }),
      })
      load()
    } finally {
      setFlagging(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando alertas…
      </div>
    )
  }

  if (!data) return <p className="text-zinc-500 text-sm">Erro ao carregar dados.</p>

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 dark:text-amber-300">Detecção de Abuso de Garantia</p>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Clientes com taxa de reposição acima de {data.threshold}% nos últimos 90 dias.
            {data.suspects.length === 0 ? ' Nenhum caso detectado.' : ` ${data.suspects.length} cliente(s) identificado(s).`}
          </p>
        </div>
      </div>

      {data.suspects.length === 0 ? (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-6 text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-green-700 dark:text-green-400 font-medium">Nenhum abuso detectado no período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.suspects.map((s) => (
            <div
              key={s.clientId}
              className={`rounded-xl border p-4 space-y-3 ${
                s.alreadyFlagged
                  ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
                  : 'border-zinc-200 dark:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{s.name}</p>
                  <p className="text-xs text-zinc-400">{s.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {s.alreadyFlagged && (
                    <Badge text="⚠ Flagged" color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" />
                  )}
                  <button
                    onClick={() => toggleFlag(s.clientId, !s.alreadyFlagged)}
                    disabled={flagging === s.clientId}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      s.alreadyFlagged
                        ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                        : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300'
                    }`}
                  >
                    {flagging === s.clientId ? '…' : s.alreadyFlagged ? 'Remover flag' : 'Sinalizar abuso'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{s.rmaRate}%</p>
                  <p className="text-xs text-zinc-500">Taxa RMA</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">{s.rmaCount}/{s.orderCount}</p>
                  <p className="text-xs text-zinc-500">RMAs / Pedidos</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-zinc-700 dark:text-zinc-300">
                    {s.grossLtv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-zinc-500">LTV Bruto</p>
                </div>
              </div>

              {s.recentRmas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 mb-1">Últimos RMAs</p>
                  <div className="space-y-1">
                    {s.recentRmas.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                        <span>{RMA_REASON_LABELS[r.reason as AccountRmaReason] ?? r.reason}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-400">{RMA_ACTION_LABELS[r.actionTaken as AccountRmaActionTaken] ?? r.actionTaken}</span>
                          <Badge text={STATUS_LABELS[r.status] ?? r.status} color={STATUS_COLORS[r.status] ?? ''} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Componente Principal ───────────────────────────────────────────────────

const TABS = [
  { id: 'queue', label: 'Fila de RMA', icon: ClipboardList },
  { id: 'analytics', label: 'Analytics CEO', icon: BarChart3 },
  { id: 'abusos', label: 'Alertas de Abuso', icon: ShieldAlert },
]

export default function RmaAdminClient() {
  const [tab, setTab] = useState<'queue' | 'analytics' | 'abusos'>('queue')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/30">
          <ShieldAlert className="w-6 h-6 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="heading-1 text-lg">Suporte & RMA</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Reposições · Diagnóstico · Analytics de Perdas
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-700">
        <nav className="flex gap-1 -mb-px">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Conteúdo */}
      {tab === 'queue' && <QueueTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'abusos' && <AbusosTab />}
    </div>
  )
}
