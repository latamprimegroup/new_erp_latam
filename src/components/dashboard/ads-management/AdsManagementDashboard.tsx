'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Copy, PauseCircle, Receipt } from 'lucide-react'

type OverviewResponse = {
  configured: boolean
  message?: string
  refreshedAt: string
  stats: { total: number; gastando: number; vendendo: number; travado: number; caiu: number }
  recovery: { inContestation: number; recoveredSinceLastSnapshot: number }
  customers: Array<{
    googleCustomerId: string
    descriptiveName: string
    statusLabel: string
    isManager: boolean
    hasOpenAppeal: boolean
    travado: boolean
    caiu: boolean
  }>
  contingencyLog: Array<{
    id: string
    googleCustomerId: string
    fellAt: string
    reason: string
    policyDetail: string | null
    currentStatusLabel: string
    recoveredAt: string | null
    recoveryDurationHours: number | null
  }>
}

function formatCustomerIdForDisplay(id: string) {
  const d = id.replace(/\D/g, '')
  if (d.length <= 10) return d
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

function StatusBadge({ label }: { label: string }) {
  const u = label.toUpperCase()
  let cls = 'bg-slate-600/40 text-slate-200 border-slate-500/40'
  if (u === 'ENABLED') cls = 'bg-emerald-900/50 text-emerald-200 border-emerald-600/40'
  if (u === 'SUSPENDED' || u.includes('PENDING')) cls = 'bg-amber-900/50 text-amber-100 border-amber-600/40'
  if (u === 'CANCELED' || u === 'CLOSED' || u === 'CANCELLED') cls = 'bg-red-900/50 text-red-200 border-red-600/40'
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  )
}

export function AdsManagementDashboard() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const q = useQuery({
    queryKey: ['ads-management-overview'],
    queryFn: async () => {
      const res = await fetch('/api/ads-management/overview')
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<OverviewResponse>
    },
  })

  const pauseMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/ads-management/quick-ops/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleCustomerIds: ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao pausar')
      return data
    },
    onSuccess: () => q.refetch(),
  })

  const refundMut = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await fetch('/api/ads-management/quick-ops/refund-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleCustomerId: id, notes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao registrar pedido')
      return data
    },
  })

  const customers = q.data?.customers ?? []

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectAllToggle = () => {
    if (selected.size === customers.length) setSelected(new Set())
    else setSelected(new Set(customers.map((c) => c.googleCustomerId)))
  }

  const statCards = useMemo(() => {
    const s = q.data?.stats
    if (!s) return []
    return [
      { label: 'TOTAL (MCC)', value: s.total, hint: 'Contas linkadas (nível 1)' },
      { label: 'GASTANDO', value: s.gastando, hint: 'ENABLED + impressões > 0 (7d)' },
      { label: 'VENDENDO', value: s.vendendo, hint: 'ENABLED + conversões > 0 (7d)' },
      { label: 'TRAVADO', value: s.travado, hint: 'SUSPENDED' },
      { label: 'CAIU', value: s.caiu, hint: 'Reprovado ou sem gasto/impressões (7d)' },
    ]
  }, [q.data?.stats])

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[#0f172a] text-slate-100 -mx-4 -mt-2 px-4 py-6 md:-mx-6 md:px-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Gestão de contas (MCC)</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Painel de guerra: métricas GAQL, diff de recuperação, log de contingência e quick ops via API Routes
              (sem expor developer token no browser).
            </p>
          </div>
          {q.data?.refreshedAt && (
            <p className="text-xs text-slate-500 font-mono">
              Atualizado: {new Date(q.data.refreshedAt).toLocaleString('pt-BR')}
            </p>
          )}
        </header>

        {!q.data?.configured && (
          <div className="rounded-lg border border-amber-700/50 bg-[#1e293b] p-4 text-amber-100 text-sm mb-6">
            {q.data?.message ?? 'Google Ads não configurado no servidor.'}
          </div>
        )}

        {q.isError && (
          <div className="rounded-lg border border-red-800/60 bg-[#1e293b] p-4 text-red-200 text-sm mb-6">
            {(q.error as Error).message}
          </div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {statCards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-slate-700/80 bg-[#1e293b] p-4 shadow-lg shadow-black/20"
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{c.label}</p>
              <p className="text-2xl font-semibold text-white mt-1">{c.value}</p>
              <p className="text-[10px] text-slate-500 mt-2 leading-snug">{c.hint}</p>
            </div>
          ))}
        </section>

        <section className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="rounded-xl border border-slate-700/80 bg-[#1e293b] p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">Inteligência de recuperação</h2>
            <p className="text-xs text-slate-500 mb-4">Diff entre o último snapshot e o estado atual no MCC.</p>
            <div className="flex gap-8">
              <div>
                <p className="text-3xl font-bold text-amber-200">{q.data?.recovery.inContestation ?? '—'}</p>
                <p className="text-xs text-slate-400 mt-1">Em contestação (SUSPENDED + ticket aberto)</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-emerald-200">
                  {q.data?.recovery.recoveredSinceLastSnapshot ?? '—'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Recuperadas neste ciclo (SUSPENDED/PENDING → ENABLED)</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/80 bg-[#1e293b] p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">Quick ops</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pauseMut.isPending || selected.size === 0 || !q.data?.configured}
                onClick={() => pauseMut.mutate(Array.from(selected))}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-4 py-2 text-sm font-medium"
              >
                <PauseCircle className="w-4 h-4" />
                Pausar tudo (campanhas ENABLED)
              </button>
              <button
                type="button"
                disabled={
                  refundMut.isPending || selected.size !== 1 || !q.data?.configured
                }
                onClick={() => {
                  const id = Array.from(selected)[0]
                  const row = customers.find((c) => c.googleCustomerId === id)
                  if (!row?.travado) {
                    alert('Selecione exatamente uma conta TRAVADA (suspensa) para solicitar reembolso.')
                    return
                  }
                  const notes = window.prompt('Notas opcionais para o pedido interno:') ?? undefined
                  refundMut.mutate({ id, notes: notes || undefined })
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-900/60 hover:bg-amber-800/70 disabled:opacity-40 px-4 py-2 text-sm font-medium border border-amber-700/40"
              >
                <Receipt className="w-4 h-4" />
                Solicitar reembolso (1 conta suspensa)
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-3">
              Pausar: envia PAUSED nas campanhas ENABLED das contas selecionadas. Reembolso: registo interno
              (processamento manual / financeiro).
            </p>
            {(pauseMut.isSuccess || pauseMut.isError) && (
              <p className="text-xs mt-2 text-slate-400">
                {pauseMut.isSuccess && JSON.stringify(pauseMut.data)}
                {pauseMut.isError && (pauseMut.error as Error).message}
              </p>
            )}
            {(refundMut.isSuccess || refundMut.isError) && (
              <p className="text-xs mt-2 text-slate-400">
                {refundMut.isSuccess && 'Pedido registrado.'}
                {refundMut.isError && (refundMut.error as Error).message}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-700/80 bg-[#1e293b] overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-slate-700/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Contas (seleção para quick ops)</h2>
            <button
              type="button"
              onClick={selectAllToggle}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              {selected.size === customers.length ? 'Limpar seleção' : 'Selecionar todas'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="p-3 w-10" />
                  <th className="p-3">ID</th>
                  <th className="p-3">Nome</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Flags</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr>
                    <td colSpan={5} className="p-6 text-slate-500">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!q.isLoading &&
                  customers.map((c) => (
                    <tr key={c.googleCustomerId} className="border-t border-slate-700/50 hover:bg-slate-800/40">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(c.googleCustomerId)}
                          onChange={() => toggle(c.googleCustomerId)}
                          className="rounded border-slate-600"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-sky-200">
                            {formatCustomerIdForDisplay(c.googleCustomerId)}
                          </code>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-slate-700 text-slate-400"
                            title="Copiar ID"
                            onClick={() =>
                              navigator.clipboard.writeText(c.googleCustomerId.replace(/\D/g, ''))
                            }
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-slate-300 max-w-[200px] truncate">{c.descriptiveName}</td>
                      <td className="p-3">
                        <StatusBadge label={c.statusLabel} />
                      </td>
                      <td className="p-3 text-xs text-slate-400">
                        {c.hasOpenAppeal && <span className="mr-2 text-amber-300">contestação</span>}
                        {c.travado && <span className="mr-2">travado</span>}
                        {c.caiu && <span className="text-red-300">caiu</span>}
                        {c.isManager && <span className="text-slate-500">sub-MCC</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-700/80 bg-[#1e293b] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/80">
            <h2 className="text-sm font-semibold text-slate-200">Log de contingência</h2>
            <p className="text-xs text-slate-500 mt-1">Audit trail persistido (após migração SQL).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="p-3">ID conta</th>
                  <th className="p-3">Data da queda</th>
                  <th className="p-3">Motivo</th>
                  <th className="p-3">Status atual</th>
                  <th className="p-3">Tempo recuperação</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.contingencyLog?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-slate-500">
                      Nenhum evento registado ainda ou tabelas não migradas.
                    </td>
                  </tr>
                )}
                {q.data?.contingencyLog?.map((row) => (
                  <tr key={row.id} className="border-t border-slate-700/50">
                    <td className="p-3 font-mono text-xs text-sky-200">
                      {formatCustomerIdForDisplay(row.googleCustomerId)}
                    </td>
                    <td className="p-3 text-slate-400 text-xs">
                      {new Date(row.fellAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-3 text-slate-300 text-xs">
                      {row.reason}
                      {row.policyDetail && (
                        <span className="block text-slate-500 mt-1">{row.policyDetail}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge label={row.currentStatusLabel} />
                    </td>
                    <td className="p-3 text-xs text-slate-400">
                      {row.recoveredAt
                        ? `${row.recoveryDurationHours ?? '—'} h`
                        : 'Em aberto'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
