'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type ConversionRow = {
  nicheId: string
  nicheName: string
  aprovados: number
  reprovados: number
  outros: number
  taxaAprovacao: number | null
}

type RankRow = { producerId: string; name: string; aprovados: number }

type ReportsPayload = {
  conversionByNiche: ConversionRow[]
  rankingProducers: RankRow[]
  sla: {
    mediaHoras: number | null
    mediaDias: number | null
    amostra: number
    definicao: string
  }
}

type AuditItem = {
  id: string
  userLabel: string | null
  action: string
  assetId: string | null
  details: unknown
  ip: string | null
  createdAt: string
}

export function AdsCoreRelatoriosClient() {
  const [reports, setReports] = useState<ReportsPayload | null>(null)
  const [repErr, setRepErr] = useState('')
  const [auditItems, setAuditItems] = useState<AuditItem[]>([])
  const [auditCursor, setAuditCursor] = useState<string | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  const loadReports = useCallback(async () => {
    setRepErr('')
    const res = await fetch('/api/admin/ads-core/reports/production')
    const j = await res.json()
    if (!res.ok) {
      setRepErr(j.error || 'Falha ao carregar relatórios')
      return
    }
    setReports(j as ReportsPayload)
  }, [])

  const loadAudit = useCallback(async (cursor?: string | null) => {
    setAuditLoading(true)
    try {
      const q = new URLSearchParams()
      q.set('limit', '30')
      if (cursor) q.set('cursor', cursor)
      const res = await fetch(`/api/admin/ads-core/audit-logs?${q}`)
      const j = (await res.json()) as { items?: AuditItem[]; nextCursor?: string | null; error?: string }
      if (!res.ok) {
        setRepErr(j.error || 'Falha ao carregar auditoria')
        return
      }
      if (cursor) {
        setAuditItems((prev) => [...prev, ...(j.items || [])])
      } else {
        setAuditItems(j.items || [])
      }
      setAuditCursor(j.nextCursor ?? null)
    } finally {
      setAuditLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReports()
    void loadAudit()
  }, [loadReports, loadAudit])

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/ads-core" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
          ← Voltar ao ADS CORE
        </Link>
        <h1 className="heading-1 mt-2">Relatórios de produção</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl mt-1">
          Indicadores agregados e trilha de auditoria (somente leitura). Logs são imutáveis.
        </p>
      </div>

      {repErr && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {repErr}
        </p>
      )}

      {reports && (
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4">
            <h2 className="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-3">
              Taxa de aprovação por nicho
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Percentual entre ativos encerrados como Aprovado vs Reprovado (ignora linhas ainda em esteira).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200 dark:border-white/10">
                    <th className="py-2 pr-2">Nicho</th>
                    <th className="py-2 pr-2">Aprovados</th>
                    <th className="py-2 pr-2">Reprovados</th>
                    <th className="py-2">% aprovação</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.conversionByNiche.map((r) => (
                    <tr key={r.nicheId} className="border-b border-gray-100 dark:border-white/5">
                      <td className="py-2 pr-2 font-medium">{r.nicheName}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.aprovados}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.reprovados}</td>
                      <td className="py-2 tabular-nums">
                        {r.taxaAprovacao != null ? `${r.taxaAprovacao}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-primary-600 dark:text-primary-400">SLA médio (atribuição → G2)</h2>
            <p className="text-xs text-gray-500">{reports.sla.definicao}</p>
            <dl className="text-sm space-y-1">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Média</dt>
                <dd className="font-mono font-medium">
                  {reports.sla.mediaHoras != null
                    ? `${reports.sla.mediaHoras} h (~${reports.sla.mediaDias} d)`
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Amostra</dt>
                <dd className="font-mono">{reports.sla.amostra}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {reports && (
        <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4">
          <h2 className="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-3">
            Ranking de produtores (contas aprovadas)
          </h2>
          <ol className="space-y-2 max-w-xl">
            {reports.rankingProducers.map((r, i) => (
              <li
                key={r.producerId}
                className="flex justify-between gap-4 text-sm border-b border-gray-100 dark:border-white/5 pb-2"
              >
                <span>
                  <span className="text-gray-400 mr-2 tabular-nums">{i + 1}.</span>
                  {r.name}
                </span>
                <span className="font-mono tabular-nums">{r.aprovados}</span>
              </li>
            ))}
            {!reports.rankingProducers.length && (
              <li className="text-sm text-gray-500">Nenhuma conta aprovada com produtor associado.</li>
            )}
          </ol>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 p-4">
        <h2 className="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-2">
          Trilha de auditoria (ADS CORE)
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Cópias de campos, abas de documento, URLs assinadas e alterações de status. Sem edição ou exclusão.
        </p>
        <ul className="space-y-2 text-sm max-h-[480px] overflow-y-auto">
          {auditItems.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-gray-100 dark:border-white/10 p-2.5 bg-gray-50/80 dark:bg-black/20"
            >
              <div className="flex flex-wrap justify-between gap-1 text-xs text-gray-500">
                <span>{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                <span>{a.userLabel || '—'}</span>
              </div>
              <p className="font-mono text-xs mt-1 text-primary-700 dark:text-primary-300">{a.action}</p>
              {a.assetId && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Ativo: <span className="font-mono">{a.assetId}</span>
                </p>
              )}
              {a.details != null && (
                <pre className="text-[10px] mt-1 overflow-x-auto text-gray-600 dark:text-gray-400 max-h-20">
                  {JSON.stringify(a.details, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
        {auditCursor && (
          <button
            type="button"
            disabled={auditLoading}
            onClick={() => void loadAudit(auditCursor)}
            className="mt-3 btn-secondary text-sm"
          >
            {auditLoading ? 'Carregando…' : 'Carregar mais'}
          </button>
        )}
      </section>
    </div>
  )
}
