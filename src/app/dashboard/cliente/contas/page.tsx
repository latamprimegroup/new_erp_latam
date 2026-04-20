'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type SmsData = {
  rentedPhone: { id: string; phoneNumber: string; status: string; expiresAt: string | null } | null
  sms: Array<{ id: string; body: string; code: string | null; receivedAt: string | null; createdAt: string }>
}

type Account = {
  id: string
  platform: string
  type: string
  googleAdsCustomerId: string | null
  status: string
  deliveredAt: string | null
  lastSpendSyncAt: string | null
  email: string | null
  cnpj: string | null
  salePrice: number | null
  spendLogs: Array<{
    periodStart: string
    periodEnd: string
    cost: number
    impressions: number
    clicks: number
    currencyCode: string
  }>
}

type Summary = {
  totalAccounts: number
  approvedCount: number
  approvalRate: number
  totalSpend: number
  monthSpend: number
  totalSpentOnAccounts: number
}

const EMPTY_SUMMARY: Summary = {
  totalAccounts: 0,
  approvedCount: 0,
  approvalRate: 0,
  totalSpend: 0,
  monthSpend: 0,
  totalSpentOnAccounts: 0,
}

function escapeCsvCell(v: string) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function downloadContasGastosCsv(accounts: Account[], summary: Summary) {
  const lines: string[] = []
  lines.push(
    [
      'Contas entregues',
      'Taxa aproveitamento %',
      'Aprovadas',
      'Gasto mês R$',
      'Gasto total API R$',
      'Investimento contas R$',
    ].join(','),
  )
  lines.push(
    [
      String(summary.totalAccounts),
      summary.approvalRate.toFixed(2),
      String(summary.approvedCount),
      summary.monthSpend.toFixed(2),
      summary.totalSpend.toFixed(2),
      summary.totalSpentOnAccounts.toFixed(2),
    ].join(','),
  )
  lines.push('')
  lines.push(
    [
      'account_id',
      'plataforma',
      'tipo',
      'status',
      'customer_id',
      'valor_pago',
      'gasto_historico_logs',
      'entregue_em',
    ].join(','),
  )
  for (const a of accounts) {
    const hist = a.spendLogs.reduce((s, l) => s + l.cost, 0)
    lines.push(
      [
        escapeCsvCell(a.id),
        escapeCsvCell(a.platform),
        escapeCsvCell(a.type),
        escapeCsvCell(a.status),
        escapeCsvCell(a.googleAdsCustomerId || ''),
        a.salePrice != null ? String(a.salePrice) : '',
        hist.toFixed(2),
        escapeCsvCell(a.deliveredAt ? new Date(a.deliveredAt).toISOString() : ''),
      ].join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url
  el.download = `contas-gastos-${new Date().toISOString().slice(0, 10)}.csv`
  el.rel = 'noopener'
  el.click()
  URL.revokeObjectURL(url)
}

const STATUS_LABELS: Record<string, string> = {
  DELIVERED: 'Entregue',
  IN_USE: 'Em uso',
  CRITICAL: 'Crítica',
}

const PLATFORM_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  KWAI_ADS: 'Kwai Ads',
  TIKTOK_ADS: 'TikTok Ads',
  OTHER: 'Outro',
}

export default function ClienteContasPage() {
  const [data, setData] = useState<{ accounts: Account[]; summary: Summary } | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [expandedSms, setExpandedSms] = useState<string | null>(null)
  const [smsData, setSmsData] = useState<Record<string, SmsData>>({})
  const [loadingSms, setLoadingSms] = useState<string | null>(null)
  const [checkingSms, setCheckingSms] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/cliente/contas')
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.accounts) && d.summary && typeof d.summary === 'object') {
          setData(d as { accounts: Account[]; summary: Summary })
        } else {
          setData({ accounts: [], summary: { ...EMPTY_SUMMARY } })
        }
      })
      .catch(() => setData({ accounts: [], summary: { ...EMPTY_SUMMARY } }))
      .finally(() => setLoading(false))
  }, [])

  async function handleSyncSpend(accountId: string) {
    setSyncing(accountId)
    try {
      const res = await fetch(`/api/cliente/contas/${accountId}/sync-spend`, {
        method: 'POST',
      })
      if (res.ok) {
        const r = await fetch('/api/cliente/contas')
        const d = await r.json()
        if (d && Array.isArray(d.accounts) && d.summary && typeof d.summary === 'object') {
          setData(d as { accounts: Account[]; summary: Summary })
        }
      } else {
        const err = await res.json()
        alert(err.error || 'Erro ao sincronizar')
      }
    } finally {
      setSyncing(null)
    }
  }

  async function toggleSms(accountId: string) {
    const willExpand = expandedSms !== accountId
    setExpandedSms((prev) => (prev === accountId ? null : accountId))
    if (willExpand && !smsData[accountId]) {
      setLoadingSms(accountId)
      try {
        const res = await fetch(`/api/cliente/contas/${accountId}/sms`)
        const d = await res.json()
        setSmsData((prev) => ({ ...prev, [accountId]: d }))
      } finally {
        setLoadingSms(null)
      }
    }
  }

  async function handleCheckSms(accountId: string) {
    setCheckingSms(accountId)
    try {
      const res = await fetch(`/api/cliente/contas/${accountId}/sms/check`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || 'Erro ao buscar SMS')
        return
      }
      if (json.newSms) {
        const r = await fetch(`/api/cliente/contas/${accountId}/sms`)
        const d = await r.json()
        setSmsData((prev) => ({ ...prev, [accountId]: d }))
      }
    } finally {
      setCheckingSms(null)
    }
  }

  if (loading || !data) {
    return (
      <div>
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700 mb-4 inline-block">← Voltar</Link>
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  const { accounts, summary } = data
  const roiDisplay =
    summary.totalSpentOnAccounts > 0
      ? `${((summary.totalSpend / summary.totalSpentOnAccounts) * 100).toFixed(1)}%`
      : '--%'

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700">← Voltar</Link>
        <h1 className="heading-1">Minhas Contas e Gastos</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">Contas entregues</p>
          <p className="text-2xl font-bold text-primary-600">{summary.totalAccounts}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Taxa de aproveitamento</p>
          <p className="text-2xl font-bold text-green-600">{summary.approvalRate.toFixed(1)}%</p>
          <p className="text-xs text-gray-400">{summary.approvedCount} aprovadas</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Gasto no mês</p>
          <p className="text-2xl font-bold text-accent-500">
            R$ {summary.monthSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Gasto total (API)</p>
          <p className="text-2xl font-bold">
            R$ {summary.totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Investimento em contas</p>
          <p className="text-2xl font-bold">
            R$ {summary.totalSpentOnAccounts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">ROI (gasto/investimento)</p>
          <p className="text-2xl font-bold text-primary-600">{roiDisplay}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="font-semibold">Contas e gastos por período</h2>
          {accounts.length > 0 && (
            <button
              type="button"
              onClick={() => downloadContasGastosCsv(accounts, summary)}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              Exportar CSV
            </button>
          )}
        </div>
        {accounts.length === 0 ? (
          <p className="text-gray-500 py-8">Nenhuma conta entregue ainda.</p>
        ) : (
          <div className="space-y-6">
            {accounts.map((acc) => {
              const monthCost = acc.spendLogs[0]?.cost ?? 0
              return (
                <div
                  key={acc.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-primary-600/20 transition-colors"
                >
                  <div className="flex flex-wrap justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">
                          {PLATFORM_LABELS[acc.platform] || acc.platform} — {acc.type}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                          {STATUS_LABELS[acc.status] || acc.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        ID: {acc.id.slice(0, 8)} {acc.googleAdsCustomerId && `• Customer: ${acc.googleAdsCustomerId}`}
                      </p>
                      {acc.email && (
                        <p className="text-xs text-gray-400">{acc.email}</p>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      {acc.googleAdsCustomerId && (
                        <button
                          onClick={() => handleSyncSpend(acc.id)}
                          disabled={!!syncing}
                          className="btn-secondary text-sm py-1.5 px-3"
                        >
                          {syncing === acc.id ? 'Sincronizando...' : 'Atualizar gastos'}
                        </button>
                      )}
                      <Link
                        href={`/dashboard/cliente/contestacoes?accountId=${acc.id}`}
                        className="text-sm text-amber-600 hover:underline"
                      >
                        Contestar / Reposição
                      </Link>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Gasto este mês</span>
                      <p className="font-medium">
                        R$ {monthCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Total histórico</span>
                      <p className="font-medium">
                        R$ {acc.spendLogs.reduce((s, l) => s + l.cost, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Última sync</span>
                      <p className="font-medium">
                        {acc.lastSpendSyncAt
                          ? new Date(acc.lastSpendSyncAt).toLocaleString('pt-BR')
                          : '—'}
                      </p>
                    </div>
                    {acc.salePrice && (
                      <div>
                        <span className="text-gray-500">Valor pago</span>
                        <p className="font-medium">R$ {acc.salePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => toggleSms(acc.id)}
                      className="text-sm text-primary-600 hover:underline flex items-center gap-2"
                    >
                      {expandedSms === acc.id ? '▲' : '▼'} Validação SMS (códigos Google)
                    </button>
                    {expandedSms === acc.id && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm">
                        {loadingSms === acc.id ? (
                          <p className="text-gray-500">Carregando...</p>
                        ) : (
                          (() => {
                            const sms = smsData[acc.id]
                            if (!sms?.rentedPhone) {
                              return (
                                <p className="text-gray-500">
                                  Esta conta não possui número alugado para validação. Solicite ao suporte.
                                </p>
                              )
                            }
                            return (
                              <div className="space-y-3">
                                <div>
                                  <span className="text-gray-500">Número vinculado:</span>
                                  <p className="font-mono font-medium">{sms.rentedPhone.phoneNumber}</p>
                                  <p className="text-xs text-gray-400">
                                    Use este número quando o Google pedir validação por SMS.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCheckSms(acc.id)}
                                  disabled={!!checkingSms}
                                  className="btn-secondary text-xs py-1.5 px-2"
                                >
                                  {checkingSms === acc.id ? 'Buscando...' : 'Buscar novos códigos'}
                                </button>
                                {sms.sms.length > 0 ? (
                                  <div>
                                    <span className="text-gray-500">Códigos recebidos:</span>
                                    <ul className="mt-2 space-y-2">
                                      {sms.sms.map((m) => (
                                        <li key={m.id} className="flex items-center gap-2">
                                          {m.code ? (
                                            <span className="font-mono font-bold text-green-700 bg-green-50 px-2 py-1 rounded">
                                              {m.code}
                                            </span>
                                          ) : (
                                            <span className="text-gray-600 truncate max-w-xs">{m.body}</span>
                                          )}
                                          <span className="text-xs text-gray-400">
                                            {m.receivedAt
                                              ? new Date(m.receivedAt).toLocaleString('pt-BR')
                                              : new Date(m.createdAt).toLocaleString('pt-BR')}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : (
                                  <p className="text-gray-500 text-xs">
                                    Nenhum SMS recebido ainda. Quando o Google enviar, clique em &quot;Buscar novos códigos&quot;.
                                  </p>
                                )}
                              </div>
                            )
                          })()
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
