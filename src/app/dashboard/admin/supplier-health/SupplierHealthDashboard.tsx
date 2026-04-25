'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, RefreshCw, ShieldOff, ShieldCheck,
  TrendingDown, TrendingUp, Loader2, CircleDollarSign, BarChart3,
  Clock, Star, Ban, ArrowUpDown,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type VendorRow = {
  id: string
  name: string
  category: string
  rating: number
  trustScore: number
  suspended: boolean
  suspendedReason: string | null
  suspendedAt: string | null
  totalAssets: number
  soldAssets: number
  availableAssets: number
  deliveredAssets: number
  totalPurchased: number
  totalRevenue: number
  availableValue: number
  survivorRate7d:  number | null
  survivorRate15d: number | null
  survivorRate30d: number | null
  totalRMA: number
  vendorFaultRMA: number
  rmaRate: number
  avgHoursToFail: number | null
  totalWarrantyCost: number
  replacementIndex: number
  effectiveLtvPerAsset: number | null
  pendingCredits: number
  liquidatedCredits: number
  topReason: string | null
  alert: 'BLACKLIST' | 'WARNING' | 'OK'
}

type Summary = {
  totalVendors: number
  suspendedVendors: number
  criticalVendors: number
  warningVendors: number
  totalPendingCredits: number
  totalWarrantyCost: number
  avgRmaRate: number
  stopLossThreshold: number
  warningThreshold: number
}

// ─── Utilitários de formatação ────────────────────────────────────────────────

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (v: number | null, decimals = 1) => v === null ? '—' : `${v.toFixed(decimals)}%`

const REASON_LABEL: Record<string, string> = {
  CHECKPOINT: 'Checkpoint', BAN: 'Ban', WRONG_PASSWORD: 'Senha errada',
  ACCOUNT_SUSPENDED: 'Suspenso', QUALITY_ISSUE: 'Qualidade', METRICS_ISSUE: 'Métricas', OTHER: 'Outro',
}

const CATEGORY_LABEL: Record<string, string> = {
  CONTAS: 'Contas Ads', PERFIS: 'Perfis', BM: 'BMs', PROXIES: 'Proxies',
  SOFTWARE: 'Software', INFRA: 'Infra', HARDWARE: 'Hardware', OUTROS: 'Outros',
}

function SurvivorBar({ value, warn }: { value: number | null; warn: number }) {
  if (value === null) return <span className="text-gray-400 text-xs">sem dados</span>
  const color = value >= 90 ? 'bg-emerald-500' : value >= warn ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className={`text-xs font-medium ${value >= 90 ? 'text-emerald-600' : value >= warn ? 'text-amber-600' : 'text-red-600'}`}>
        {pct(value)}
      </span>
    </div>
  )
}

function AlertBadge({ alert, suspended }: { alert: string; suspended: boolean }) {
  if (suspended || alert === 'BLACKLIST') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-300 dark:border-red-800">
      <Ban className="w-3 h-3" /> FORNECEDOR CRÍTICO
    </span>
  )
  if (alert === 'WARNING') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      <AlertTriangle className="w-3 h-3" /> ATENÇÃO
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> OK
    </span>
  )
}

function TrustStars({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`w-1.5 h-4 rounded-sm ${i < score ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
      ))}
      <span className="ml-1 text-xs text-gray-500">{score}/10</span>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function SupplierHealthDashboard() {
  const [data, setData] = useState<{ vendors: VendorRow[]; summary: Summary } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'rmaRate' | 'survivorRate30d' | 'pendingCredits' | 'replacementIndex'>('rmaRate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rma/vendor-qa')
      if (!res.ok) throw new Error('Erro ao carregar dados')
      setData(await res.json())
    } catch {
      setToast({ type: 'err', msg: 'Falha ao carregar dados de fornecedores.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleSuspend(vendor: VendorRow) {
    setActionId(vendor.id)
    try {
      const res = await fetch(`/api/compras/fornecedores/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          vendor.suspended
            ? { suspended: false, suspendedReason: null }
            : { suspended: true, suspendedReason: `Stop-loss manual via CEO Dashboard em ${new Date().toLocaleDateString('pt-BR')}` }
        ),
      })
      if (!res.ok) throw new Error()
      setToast({ type: 'ok', msg: vendor.suspended ? `${vendor.name} reativado.` : `${vendor.name} suspenso manualmente.` })
      load()
    } catch {
      setToast({ type: 'err', msg: 'Erro ao alterar status do fornecedor.' })
    } finally {
      setActionId(null)
    }
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = data?.vendors
    ? [...data.vendors].sort((a, b) => {
        const valA = sortKey === 'survivorRate30d' ? (a[sortKey] ?? -1) : a[sortKey]
        const valB = sortKey === 'survivorRate30d' ? (b[sortKey] ?? -1) : b[sortKey]
        return sortDir === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number)
      })
    : []

  const s = data?.summary

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="heading-1 flex items-center gap-2">
            🛰️ Saúde de Fornecedores
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">CEO View</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Inteligência de qualidade em tempo real — identifique fornecedores que destroem margem.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`rounded-lg p-3 text-sm font-medium flex items-center gap-2 ${
          toast.type === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
        }`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" /> Carregando inteligência de fornecedores...
        </div>
      ) : !data ? null : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Fornecedores</div>
              <div className="text-2xl font-bold">{s?.totalVendors ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">{s?.suspendedVendors} suspensos · {s?.criticalVendors} críticos</div>
            </div>
            <div className={`card p-4 ${(s?.criticalVendors ?? 0) > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10' : ''}`}>
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Stop-Loss Ativo</div>
              <div className="text-2xl font-bold text-red-600">{s?.criticalVendors ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Limiar: {s?.stopLossThreshold}% de RMA por culpa</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CircleDollarSign className="w-3 h-3" /> Créditos Pendentes</div>
              <div className="text-2xl font-bold text-amber-600">{brl(s?.totalPendingCredits ?? 0)}</div>
              <div className="text-xs text-gray-500 mt-1">O que os fornecedores nos devem</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Custo de Garantia Total</div>
              <div className="text-2xl font-bold text-red-500">{brl(s?.totalWarrantyCost ?? 0)}</div>
              <div className="text-xs text-gray-500 mt-1">RMA rate médio: {pct(s?.avgRmaRate ?? null)}</div>
            </div>
          </div>

          {/* Alertas críticos */}
          {sorted.filter((v) => v.suspended || v.alert === 'BLACKLIST').length > 0 && (
            <div className="rounded-xl border-2 border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Ban className="w-5 h-5 text-red-600" />
                <h2 className="font-bold text-red-700 dark:text-red-400">⛔ FORNECEDORES CRÍTICOS — STOP LOSS ATIVO</h2>
              </div>
              <div className="space-y-2">
                {sorted.filter((v) => v.suspended || v.alert === 'BLACKLIST').map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-black/20 rounded-lg p-3">
                    <div>
                      <span className="font-semibold text-red-700 dark:text-red-400">{v.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{CATEGORY_LABEL[v.category] ?? v.category}</span>
                      {v.suspendedReason && (
                        <p className="text-xs text-gray-500 mt-0.5">{v.suspendedReason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm">
                        <span className="text-red-600 font-bold">{pct(v.rmaRate)}</span>
                        <span className="text-gray-400 text-xs"> RMA · {v.vendorFaultRMA}/{v.totalAssets} ativos</span>
                      </div>
                      <span className="text-amber-600 text-sm font-medium">{brl(v.pendingCredits)} pendente</span>
                      <button
                        onClick={() => toggleSuspend(v)}
                        disabled={actionId === v.id}
                        className="btn-secondary text-xs flex items-center gap-1"
                      >
                        {actionId === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                        {v.suspended ? 'Reativar' : 'Suspender'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabela principal */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2">
              <h2 className="heading-2 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> Ranking de Fornecedores
              </h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ArrowUpDown className="w-3 h-3" /> Ordenar por:
                {(
                  [
                    ['rmaRate', 'RMA Rate'],
                    ['survivorRate30d', 'Sobrevivência 30d'],
                    ['pendingCredits', 'Créditos Pend.'],
                    ['replacementIndex', 'Índice Subst.'],
                  ] as [typeof sortKey, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => toggleSort(k)}
                    className={`px-2 py-1 rounded ${sortKey === k ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  >
                    {label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trust Score</th>
                    <th className="px-4 py-3">Sobrevivência 7d / 15d / 30d</th>
                    <th className="px-4 py-3">RMA Rate</th>
                    <th className="px-4 py-3">Índice Subst.</th>
                    <th className="px-4 py-3">LTV / Ativo</th>
                    <th className="px-4 py-3">Crédito Pend.</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((v) => (
                    <>
                      <tr
                        key={v.id}
                        onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                        className={`border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${
                          v.suspended ? 'bg-red-50/30 dark:bg-red-950/10' :
                          v.alert === 'WARNING' ? 'bg-amber-50/20 dark:bg-amber-950/5' : ''
                        } hover:bg-gray-50 dark:hover:bg-gray-800/30`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">{v.name}</div>
                          <div className="text-xs text-gray-400">{CATEGORY_LABEL[v.category] ?? v.category} · {v.totalAssets} ativos</div>
                        </td>
                        <td className="px-4 py-3">
                          <AlertBadge alert={v.alert} suspended={v.suspended} />
                        </td>
                        <td className="px-4 py-3">
                          <TrustStars score={v.trustScore} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-6 text-gray-400">7d</span>
                              <SurvivorBar value={v.survivorRate7d} warn={70} />
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-6 text-gray-400">15d</span>
                              <SurvivorBar value={v.survivorRate15d} warn={65} />
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-6 text-gray-400">30d</span>
                              <SurvivorBar value={v.survivorRate30d} warn={60} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-bold text-sm ${v.rmaRate >= (s?.stopLossThreshold ?? 30) ? 'text-red-600' : v.rmaRate >= (s?.warningThreshold ?? 10) ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {pct(v.rmaRate)}
                          </span>
                          <div className="text-xs text-gray-400">{v.vendorFaultRMA} de {v.totalAssets}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-medium ${v.replacementIndex > 20 ? 'text-red-600' : v.replacementIndex > 5 ? 'text-amber-600' : 'text-gray-700 dark:text-gray-300'}`}>
                            {pct(v.replacementIndex)}
                          </span>
                          <div className="text-xs text-gray-400">{brl(v.totalWarrantyCost)} total</div>
                        </td>
                        <td className="px-4 py-3">
                          {v.effectiveLtvPerAsset !== null ? (
                            <span className={`font-medium ${v.effectiveLtvPerAsset < 0 ? 'text-red-600' : 'text-gray-800 dark:text-gray-200'}`}>
                              {brl(v.effectiveLtvPerAsset)}
                            </span>
                          ) : <span className="text-gray-400 text-xs">sem vendas</span>}
                        </td>
                        <td className="px-4 py-3">
                          {v.pendingCredits > 0 ? (
                            <span className="font-semibold text-amber-600">{brl(v.pendingCredits)}</span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); void toggleSuspend(v) }}
                            disabled={actionId === v.id}
                            className={`text-xs flex items-center gap-1 ml-auto px-3 py-1.5 rounded-lg font-medium transition-colors ${
                              v.suspended
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300'
                            }`}
                          >
                            {actionId === v.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : v.suspended ? (
                              <ShieldCheck className="w-3 h-3" />
                            ) : (
                              <ShieldOff className="w-3 h-3" />
                            )}
                            {v.suspended ? 'Reativar' : 'Suspender'}
                          </button>
                        </td>
                      </tr>

                      {/* Linha expandida com detalhes */}
                      {expanded === v.id && (
                        <tr key={`${v.id}-detail`} className="bg-gray-50 dark:bg-gray-900/50">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Receita gerada</div>
                                <div className="font-semibold">{brl(v.totalRevenue)}</div>
                                <div className="text-xs text-gray-500">{v.soldAssets} ativos vendidos</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><CircleDollarSign className="w-3 h-3" /> Total comprado</div>
                                <div className="font-semibold">{brl(v.totalPurchased)}</div>
                                <div className="text-xs text-gray-500">{v.availableAssets} disponíveis · {brl(v.availableValue)} em catálogo</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Tempo médio p/ falha</div>
                                <div className="font-semibold">
                                  {v.avgHoursToFail !== null ? `${Math.round(v.avgHoursToFail)}h` : '—'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Motivo top: {v.topReason ? REASON_LABEL[v.topReason] ?? v.topReason : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Créditos liquidados</div>
                                <div className="font-semibold text-emerald-600">{brl(v.liquidatedCredits)}</div>
                                <div className="text-xs text-gray-500">{brl(v.pendingCredits)} ainda pendentes</div>
                              </div>
                            </div>
                            {v.suspended && v.suspendedReason && (
                              <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300">
                                <strong>Motivo da suspensão:</strong> {v.suspendedReason}
                                {v.suspendedAt && ` (${new Date(v.suspendedAt).toLocaleDateString('pt-BR')})`}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {sorted.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                Nenhum fornecedor cadastrado ainda.
              </div>
            )}
          </div>

          {/* Legenda */}
          <div className="card p-4 text-xs text-gray-500 space-y-1">
            <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">📖 Legenda dos indicadores</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div><strong>Taxa de Sobrevivência 7/15/30d</strong> — % de ativos deste fornecedor que NÃO geraram RMA dentro da janela temporal após entrega.</div>
              <div><strong>RMA Rate</strong> — % de ativos com incidente por culpa do fornecedor. Acima de {s?.warningThreshold}% = Atenção; acima de {s?.stopLossThreshold}% = Stop Loss.</div>
              <div><strong>Índice de Substituição</strong> — Custo total de reposições como % do valor comprado deste fornecedor. Quanto maior, pior o ROI.</div>
              <div><strong>LTV / Ativo</strong> — (Receita - Custo de reposição) ÷ ativos vendidos. Valor negativo = fornecedor destrói margem.</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
