'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { SkeletonTable } from '@/components/Skeleton'

type Producer = { id: string; name: string | null; email: string }
type Account = {
  id: string
  platform: string
  type: string
  status: string
  updatedAt: string
  producer: Producer
}
type G2Item = {
  id: string
  codeG2: string
  status: string
  approvedAt: string | null
  creator: Producer
}

type HistoricoRow = {
  id: string
  createdAt: string
  userName: string
  userId: string | null
  details: unknown
}

type Data = {
  date: string
  pending: { accounts: number; g2Items: number; total: number }
  items: { accounts: Account[]; g2Items: G2Item[] }
  byProducer: Array<{
    producer: Producer
    accounts: Account[]
    g2Items: G2Item[]
  }>
  pay?: {
    valorPorConta: number
    nota: string
  }
  efficiency?: {
    approvedSameDay: number
    validatedSameDay: number
    pendingConference: number
    lowEfficiencyValidation: boolean
  }
  historicoConferencias?: HistoricoRow[]
}

export function ConferenciaClient() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const canBatchWithdrawal = role === 'ADMIN' || role === 'FINANCE'

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [selectedG2, setSelectedG2] = useState<Set<string>>(new Set())
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [createWithdrawalBatch, setCreateWithdrawalBatch] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setSuccessMsg(null)
    fetch(`/api/producao/conferencia-diaria?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setSelectedAccounts(new Set())
        setSelectedG2(new Set())
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleG2 = (id: string) => {
    setSelectedG2((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (!data) return
    setSelectedAccounts(new Set(data.items.accounts.map((a) => a.id)))
    setSelectedG2(new Set(data.items.g2Items.map((g) => g.id)))
  }

  const deselectAll = () => {
    setSelectedAccounts(new Set())
    setSelectedG2(new Set())
  }

  const totalSelected = selectedAccounts.size + selectedG2.size
  const valorPorConta = data?.pay?.valorPorConta ?? 0
  const totalPagamentoEstimado = totalSelected * valorPorConta

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

  const handleValidar = async () => {
    if (selectedAccounts.size === 0 && selectedG2.size === 0) {
      setError('Selecione ao menos uma conta para validar.')
      return
    }
    if (!password.trim()) {
      setError('Informe sua senha para assinar a conferência.')
      return
    }
    setSubmitting(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await fetch('/api/producao/conferencia-diaria/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          productionAccountIds: Array.from(selectedAccounts),
          productionG2Ids: Array.from(selectedG2),
          conferenceDate: date,
          createWithdrawalBatch: canBatchWithdrawal && createWithdrawalBatch,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Erro ao validar')
        return
      }
      setPassword('')
      setShowPassword(false)
      setCreateWithdrawalBatch(false)
      setSelectedAccounts(new Set())
      setSelectedG2(new Set())
      const parts = [
        `Conferência registrada: ${json.validated?.total ?? 0} conta(s).`,
        json.withdrawals?.created > 0
          ? ` ${json.withdrawals.created} saque(s) gerado(s) no Financeiro.`
          : '',
        json.withdrawals?.skippedReason ? ` (${json.withdrawals.skippedReason})` : '',
      ]
      setSuccessMsg(parts.join(''))
      setLoading(true)
      const r = await fetch(`/api/producao/conferencia-diaria?date=${date}`)
      const d = await r.json()
      setData(d)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
      setLoading(false)
    }
  }

  const historico = data?.historicoConferencias ?? []
  const eff = data?.efficiency

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Conferência Diária</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Valide as contas aprovadas do dia com sua senha. Apenas contas conferidas entram para pagamento do
          produtor.
        </p>
      </div>

      {eff?.lowEfficiencyValidation && (
        <div
          className="rounded-xl border border-amber-300/80 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
          role="status"
        >
          <p className="font-semibold">Baixa eficiência de validação neste dia</p>
          <p className="mt-1 opacity-90">
            Há {eff.pendingConference} conta(s) ainda sem conferência, de {eff.approvedSameDay} aprovada(s) no
            dia ({Math.round((eff.pendingConference / Math.max(eff.approvedSameDay, 1)) * 100)}% pendente).
            Revise a fila para não atrasar o financeiro.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Data:</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field w-auto px-3 py-2 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-ads-dark-card px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10"
          >
            Selecionar todas
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-ads-dark-card px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10"
          >
            Limpar seleção
          </button>
        </div>
        <Link
          href="/dashboard/saques"
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline ml-auto"
        >
          Ir para Saques →
        </Link>
      </div>

      {data?.efficiency && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card px-3 py-2">
            <p className="text-gray-500 dark:text-gray-400">Aprovadas no dia</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {data.efficiency.approvedSameDay}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card px-3 py-2">
            <p className="text-gray-500 dark:text-gray-400">Conferidas no dia</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {data.efficiency.validatedSameDay}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card px-3 py-2">
            <p className="text-gray-500 dark:text-gray-400">Pendente conferência</p>
            <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
              {data.efficiency.pendingConference}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card px-3 py-2">
            <p className="text-gray-500 dark:text-gray-400">Data (ref.)</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {new Date(date).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {successMsg}
        </div>
      )}

      {totalSelected > 0 && data?.pay && (
        <div className="rounded-xl border border-primary-200/60 dark:border-primary-500/30 bg-primary-50/50 dark:bg-primary-950/20 px-4 py-3">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Total estimado para pagamento (seleção atual)
          </p>
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">
            {fmtMoney(totalPagamentoEstimado)}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {totalSelected} conta(s) × {fmtMoney(valorPorConta)}. {data.pay.nota}
          </p>
        </div>
      )}

      {historico.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Histórico de conferências (auditoria)
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Últimos registos com quem assinou a conferência (logs do sistema).
          </p>
          <ul className="space-y-2 max-h-48 overflow-y-auto text-sm">
            {historico.map((h) => {
              const det = h.details as Record<string, unknown> | null
              const cd = typeof det?.conferenceDate === 'string' ? det.conferenceDate : null
              const total = typeof det?.validatedCount === 'number' ? det.validatedCount : null
              return (
                <li
                  key={h.id}
                  className="flex flex-wrap gap-x-3 gap-y-1 border-b border-gray-100 dark:border-white/10 pb-2 last:border-0"
                >
                  <span className="text-gray-500 dark:text-gray-400">
                    {new Date(h.createdAt).toLocaleString('pt-BR')}
                  </span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{h.userName}</span>
                  {cd && <span className="text-gray-600 dark:text-gray-300">Data ref.: {cd}</span>}
                  {total != null && (
                    <span className="text-primary-600 dark:text-primary-400">{total} conta(s)</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : data && data.pending.total > 0 ? (
        <>
          <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
              <span className="font-medium text-gray-800 dark:text-gray-200">
                Pendentes: {data.pending.accounts} Produção + {data.pending.g2Items} G2
              </span>
              {totalSelected > 0 && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {totalSelected} selecionada{totalSelected > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/10 max-h-[400px] overflow-y-auto scrollbar-ads">
              {data.items.accounts.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedAccounts.has(a.id)}
                    onChange={() => toggleAccount(a.id)}
                  />
                  <span className="text-gray-500 dark:text-gray-400 w-20">Produção</span>
                  <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                    {a.platform}/{a.type}
                  </span>
                  <span className="text-gray-600 dark:text-gray-300">{a.producer.name || a.producer.email}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">
                    {new Date(a.updatedAt).toLocaleString('pt-BR')}
                  </span>
                </label>
              ))}
              {data.items.g2Items.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedG2.has(g.id)}
                    onChange={() => toggleG2(g.id)}
                  />
                  <span className="text-gray-500 dark:text-gray-400 w-20">G2</span>
                  <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{g.codeG2}</span>
                  <span className="text-gray-600 dark:text-gray-300">{g.creator.name || g.creator.email}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">
                    {g.approvedAt ? new Date(g.approvedAt).toLocaleString('pt-BR') : '—'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {totalSelected > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-4 shadow-sm space-y-4">
              {!showPassword ? (
                <button
                  type="button"
                  onClick={() => setShowPassword(true)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Conferir {totalSelected} conta{totalSelected > 1 ? 's' : ''} selecionada
                  {totalSelected > 1 ? 's' : ''}
                </button>
              ) : (
                <div className="space-y-3 max-w-md">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Sua senha para assinar
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Digite sua senha"
                      className="input-field mt-1"
                      autoFocus
                    />
                  </label>
                  {canBatchWithdrawal && (
                    <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={createWithdrawalBatch}
                        onChange={(e) => setCreateWithdrawalBatch(e.target.checked)}
                      />
                      <span>
                        Gerar lote de saque no Financeiro (um PENDING por produtor: contas conferidas × valor
                        por conta). Requer <code className="text-xs">produção_valor_por_conta</code> &gt; 0.
                      </span>
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleValidar()}
                      disabled={submitting || !password.trim()}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Validando...' : 'Confirmar conferência'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPassword(false)
                        setPassword('')
                        setCreateWithdrawalBatch(false)
                      }}
                      className="rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-ads-dark-card px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-8 text-center text-gray-500 dark:text-gray-400">
          Nenhuma conta pendente de conferência para {new Date(date).toLocaleDateString('pt-BR')}.
        </div>
      )}
    </div>
  )
}
