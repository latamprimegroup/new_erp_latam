'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Meta = {
  metaMaxima: number
  producaoAtual: number
  producaoDiariaMedia: number
  diasRestantes: number
  producaoDiariaNecessaria: number
  projecao: number
  metaEmRisco: boolean
  percentual: number
}

type RankItem = { producerId: string; name: string | null; count: number; rank: number }

type AlertItem = {
  id: string
  type: string
  severity: string
  message: string
  resolvedAt: string | null
  createdAt: string
  producer: { name: string | null }
}

export function AgenteG2Client() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [ranking, setRanking] = useState<RankItem[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const [metaRes, rankRes, alertsRes] = await Promise.all([
          fetch('/api/production-g2/agent/meta'),
          fetch('/api/production-g2/agent/ranking'),
          fetch('/api/production-g2/agent/alerts?resolved=false'),
        ])
        if (metaRes.ok) setMeta(await metaRes.json())
        if (rankRes.ok) {
          const d = await rankRes.json()
          setRanking(d.ranking || [])
        }
        if (alertsRes.ok) {
          const d = await alertsRes.json()
          setAlerts(d.alerts || [])
        }
      } catch {
        setMeta(null)
        setRanking([])
        setAlerts([])
      }
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card animate-pulse h-32" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card animate-pulse h-48" />
          <div className="card animate-pulse h-48" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/producao-g2" className="text-primary-600 hover:underline text-sm">
        ← Voltar para Produção G2
      </Link>

      {meta && (
        <div
          className={`card border-2 ${
            meta.metaEmRisco
              ? 'border-amber-300/80 bg-amber-50/30'
              : 'border-emerald-200/80 bg-emerald-50/20'
          }`}
        >
          <h2 className="font-semibold text-slate-800 mb-3">
            {meta.metaEmRisco ? '⚠ Meta em risco' : '✓ Meta no ritmo'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-slate-500">Produção / Meta</p>
              <p className="text-xl font-bold text-primary-600">
                {meta.producaoAtual} / {meta.metaMaxima}
              </p>
              <p className="text-sm text-slate-600">{meta.percentual}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Projeção</p>
              <p className="text-xl font-bold text-slate-800">{meta.projecao}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Ritmo médio/dia</p>
              <p className="text-xl font-bold text-slate-800">{meta.producaoDiariaMedia}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Necessário/dia</p>
              <p
                className={`text-xl font-bold ${meta.metaEmRisco ? 'text-amber-600' : 'text-slate-800'}`}
              >
                {meta.producaoDiariaNecessaria}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Dias restantes</p>
              <p className="text-xl font-bold text-slate-800">{meta.diasRestantes}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-3">🏆 Ranking do mês</h2>
          {ranking.length === 0 ? (
            <p className="text-slate-500 text-sm">Nenhum dado ainda</p>
          ) : (
            <ul className="space-y-2">
              {ranking.slice(0, 10).map((r) => (
                <li key={r.producerId} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        r.rank === 1 ? 'bg-amber-100 text-amber-700' : r.rank === 2 ? 'bg-slate-200 text-slate-700' : r.rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {r.rank}
                    </span>
                    {r.name || 'Sem nome'}
                  </span>
                  <span className="font-semibold text-primary-600">{r.count} contas</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-3">🔔 Alertas ativos</h2>
          {alerts.length === 0 ? (
            <p className="text-slate-500 text-sm">Nenhum alerta pendente</p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 10).map((a) => (
                <li
                  key={a.id}
                  className={`p-3 rounded-lg text-sm ${
                    a.severity === 'CRITICAL' ? 'bg-red-50 text-red-800' : a.severity === 'WARNING' ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="font-medium">{a.type}</p>
                  <p>{a.message}</p>
                  <p className="text-xs mt-1 opacity-75">
                    {a.producer?.name} · {new Date(a.createdAt).toLocaleString('pt-BR')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
