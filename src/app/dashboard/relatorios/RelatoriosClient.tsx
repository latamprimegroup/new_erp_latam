'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const PLATFORMS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  KWAI_ADS: 'Kwai Ads',
  TIKTOK_ADS: 'TikTok Ads',
  OTHER: 'Outro',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  AVAILABLE: 'Disponível',
  IN_USE: 'Em uso',
  CRITICAL: 'Crítico',
  DELIVERED: 'Entregue',
}

type Report = {
  production: { platform: string; count: number }[]
  stock: { status: string; count: number }[]
  sales: { client: string; total: number; orders: number }[]
  withdrawals: { gateway: string; total: number; count: number }[]
  period: { month: string; year: string }
}

export function RelatoriosClient() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year, setYear] = useState(String(new Date().getFullYear()))

  useEffect(() => {
    setLoading(true)
    fetch(`/api/relatorios?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then(setReport)
      .finally(() => setLoading(false))
  }, [month, year])

  function exportCSV() {
    if (!report) return
    const lines: string[] = []
    lines.push('Relatório ERP Ads Ativos')
    lines.push(`Período: ${month}/${year}`)
    lines.push('')
    lines.push('Produção por Plataforma,Quantidade')
    report.production.forEach((p) => lines.push(`${PLATFORMS[p.platform] || p.platform},${p.count}`))
    lines.push('')
    lines.push('Estoque por Status,Quantidade')
    report.stock.forEach((s) => lines.push(`${STATUS_LABELS[s.status] || s.status},${s.count}`))
    lines.push('')
    lines.push('Vendas por Cliente,Total (R$),Pedidos')
    report.sales.forEach((s) => lines.push(`${s.client},${s.total.toFixed(2)},${s.orders}`))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-${year}-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <p className="text-gray-500 py-8">Carregando...</p>
  }

  return (
    <div>
      <h1 className="heading-1 mb-4">Relatórios & KPIs</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Para <strong className="font-medium text-gray-800 dark:text-gray-200">ROI real, LTV, CPA</strong> e CRM
        integrado ao TinTim, use o{' '}
        <Link
          href="/dashboard/roi-crm"
          className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
        >
          Dashboard de ROI & CRM
        </Link>
        .
      </p>

      <div className="card mb-6">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <div className="flex gap-2 items-center">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="input-field py-1.5 px-2 w-24 text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="input-field py-1.5 px-2 w-24 text-sm"
            >
              {[2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-secondary text-sm">
              Exportar CSV
            </button>
            <button
              onClick={() => window.print()}
              className="btn-secondary text-sm"
            >
              Exportar PDF (imprimir)
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4">Produção Mensal (por plataforma)</h3>
          {report?.production.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum dado no período</p>
          ) : (
            <ul className="space-y-2">
              {report?.production.map((p) => (
                <li key={p.platform} className="flex justify-between">
                  <span>{PLATFORMS[p.platform] || p.platform}</span>
                  <span className="font-medium">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Estoque por Status</h3>
          {report?.stock.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum dado</p>
          ) : (
            <ul className="space-y-2">
              {report?.stock.map((s) => (
                <li key={s.status} className="flex justify-between">
                  <span>{STATUS_LABELS[s.status] || s.status}</span>
                  <span className="font-medium">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Vendas por Cliente</h3>
          {report?.sales.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhuma venda no período</p>
          ) : (
            <ul className="space-y-2">
              {report?.sales.slice(0, 10).map((s, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate max-w-[140px]" title={s.client}>{s.client}</span>
                  <span className="font-medium">R$ {s.total.toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Saques por Gateway</h3>
          {report?.withdrawals.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum saque no período</p>
          ) : (
            <ul className="space-y-2">
              {report?.withdrawals.map((w) => (
                <li key={w.gateway} className="flex justify-between">
                  <span>{w.gateway}</span>
                  <span className="font-medium">R$ {w.total.toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
