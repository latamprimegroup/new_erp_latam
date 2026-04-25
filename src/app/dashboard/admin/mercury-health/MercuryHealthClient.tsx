'use client'

import { useState, useEffect } from 'react'
import {
  DollarSign,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  TrendingUp,
  ArrowUpRight,
  Copy,
  ExternalLink,
  Banknote,
  Zap,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type MercuryAccount = {
  id: string; name: string; type: string; status: string
  availableBalance: number; currentBalance: number
}

type MercuryData = {
  ok: boolean
  configured: boolean
  webhookConfigured: boolean
  accountId: string | null
  health: { ok: boolean; accounts: number; totalUsd: number; error?: string }
  balance: {
    availableUsd: number; currentUsd: number; fxRate: number
    fxUpdatedAt: string; equivalentBrl: number
  }
  accounts: MercuryAccount[]
  recentTransactions: {
    id: string; amount: number; currency: string; kind: string
    status: string; counterparty: string | null; memo: string | null; postedAt: string
  }[]
  internalHistory: {
    count: number; totalUsdReceived: number; totalBrlEquiv: number
    transactions: { id: string; amountUsd: number; fxRate: number; occurredAt: string; externalRef: string | null }[]
  }
  setup: { webhookUrl: string; eventTypes: string[]; filterPaths: string[] }
  message?: string
  steps?: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$ ${(n / 1_000).toFixed(2)}k`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtBrl(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(1)}k`
  return `R$ ${n.toLocaleString('pt-BR')}`
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? 'text-green-400' : 'text-red-400'}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {ok ? 'OK' : 'ERRO'}
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function MercuryHealthClient() {
  const [data, setData] = useState<MercuryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  function load() {
    setLoading(true)
    fetch('/api/admin/mercury')
      .then((r) => r.json())
      .then((d: MercuryData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function copyWebhookUrl() {
    if (data?.setup.webhookUrl) {
      navigator.clipboard.writeText(data.setup.webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Globe className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Mercury Bank — Conta LLC USD</h1>
            <p className="text-zinc-500 text-xs mt-0.5">Operação Internacional • ACH / Wire</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-zinc-900 animate-pulse" />
          ))}
        </div>
      )}

      {/* Não configurado */}
      {data && !data.configured && (
        <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-amber-300 mb-3">Mercury não configurado</h2>
              <ol className="space-y-1.5 text-sm text-zinc-400">
                {data.steps?.map((step, i) => (
                  <li key={i} className="font-mono text-xs bg-zinc-900 px-3 py-2 rounded">{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      {data && data.configured && (
        <>
          {/* Status chips */}
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm">
              <span className="text-zinc-500">API Key</span>
              <StatusDot ok={data.health.ok} />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm">
              <span className="text-zinc-500">Webhook Secret</span>
              <StatusDot ok={data.webhookConfigured} />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm">
              <span className="text-zinc-500">Contas</span>
              <span className="text-white font-medium">{data.health.accounts}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm">
              <span className="text-zinc-500">Câmbio USD/BRL</span>
              <span className="text-blue-400 font-medium">R$ {data.balance.fxRate.toFixed(4)}</span>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {/* Saldo disponível */}
            <div className="bg-zinc-900 border border-blue-500/20 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <DollarSign className="w-5 h-5 text-blue-400" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Saldo Disponível</p>
              <p className="text-2xl font-bold text-blue-400">{fmtUsd(data.balance.availableUsd)}</p>
              <p className="text-zinc-500 text-xs mt-1">≈ {fmtBrl(data.balance.equivalentBrl)}</p>
            </div>

            {/* Total recebido (histórico interno) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
              </div>
              <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Recebido (90d)</p>
              <p className="text-2xl font-bold text-green-400">
                {fmtUsd(data.internalHistory.totalUsdReceived)}
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                ≈ {fmtBrl(data.internalHistory.totalBrlEquiv)} · {data.internalHistory.count} tx
              </p>
            </div>

            {/* Câmbio live */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
              </div>
              <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Câmbio live</p>
              <p className="text-2xl font-bold text-white">
                1 USD = R$ {data.balance.fxRate.toFixed(4)}
              </p>
              <p className="text-zinc-500 text-xs mt-1 truncate">{data.balance.fxUpdatedAt}</p>
            </div>
          </div>

          {/* Contas */}
          {data.accounts.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-blue-400" />
                Contas Mercury
              </h2>
              <div className="space-y-3">
                {data.accounts.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/60">
                    <div>
                      <p className="font-medium text-sm">{acc.name}</p>
                      <p className="text-zinc-500 text-xs capitalize">{acc.type} · {acc.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-blue-400">{fmtUsd(acc.availableBalance)}</p>
                      <p className="text-zinc-500 text-xs">disponível</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transações recentes */}
          {data.recentTransactions.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
              <h2 className="font-semibold mb-4">Transações Recentes (Mercury)</h2>
              <div className="space-y-2">
                {data.recentTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{tx.counterparty ?? 'International'}</p>
                      <p className="text-zinc-500 text-xs">{tx.kind} · {tx.memo ?? '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.amount > 0 ? '+' : ''}{fmtUsd(tx.amount)}
                      </p>
                      <p className="text-zinc-500 text-xs">{new Date(tx.postedAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Histórico interno (processados pelo ERP) */}
          {data.internalHistory.transactions.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
              <h2 className="font-semibold mb-4">Histórico Processado (ERP)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-zinc-500 text-xs uppercase border-b border-zinc-800">
                      <th className="pb-2 pr-4">Data</th>
                      <th className="pb-2 pr-4">Valor USD</th>
                      <th className="pb-2 pr-4">Câmbio</th>
                      <th className="pb-2">Ref. Mercury</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.internalHistory.transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-zinc-800/60 last:border-0">
                        <td className="py-2.5 pr-4 text-zinc-400 text-xs">
                          {new Date(tx.occurredAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-2.5 pr-4 font-medium text-green-400">
                          {fmtUsd(tx.amountUsd)}
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-400 text-xs">
                          R$ {tx.fxRate.toFixed(4)}
                        </td>
                        <td className="py-2.5 text-zinc-500 text-xs truncate max-w-[180px]">
                          {tx.externalRef ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Setup Webhook */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Configuração do Webhook
            </h2>
            <p className="text-zinc-500 text-sm mb-4">
              Configure manualmente no{' '}
              <a
                href="https://app.mercury.com/settings/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
              >
                Mercury Dashboard → Webhooks <ExternalLink className="w-3 h-3" />
              </a>
            </p>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-zinc-500 text-xs mb-1">URL do Webhook</p>
                <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-green-400 text-xs break-all">{data.setup.webhookUrl}</code>
                  <button
                    onClick={copyWebhookUrl}
                    className="shrink-0 text-zinc-400 hover:text-white transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {copied && <span className="text-green-400 text-xs">Copiado!</span>}
                </div>
              </div>
              <div>
                <p className="text-zinc-500 text-xs mb-1">Eventos a Subscrever</p>
                <div className="flex gap-2 flex-wrap">
                  {data.setup.eventTypes.map((e) => (
                    <span key={e} className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs font-mono">{e}</span>
                  ))}
                </div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-amber-950/30 border border-amber-700/30 text-xs text-amber-300">
                Após criar o webhook, copie o <strong>secretKey</strong> gerado pelo Mercury e adicione como{' '}
                <code className="font-mono">MERCURY_WEBHOOK_SECRET</code> no .env
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
