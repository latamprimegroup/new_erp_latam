'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type AntiIdleRow = {
  producerId: string
  name: string | null
  email: string
  openCount: number
}

type ProducerRank = {
  producerId: string
  name: string | null
  email: string
  approved: number
  rejected: number
  inProgress: number
  rejectionRatePct: number | null
}

type NicheStat = {
  nicheId: string
  nicheName: string
  approved: number
  rejected: number
  /** Pendente (estoque/atribuído) + em produção */
  emAberto: number
  /** Enviado à verificação G2 / plataforma */
  emVerificacaoG2: number
  inProgress: number
  rejectionRatePct: number | null
}

export default function AdsCoreBiClient() {
  const [anti, setAnti] = useState<AntiIdleRow[]>([])
  const [prodRank, setProdRank] = useState<ProducerRank[]>([])
  const [nicheStats, setNicheStats] = useState<NicheStat[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [aRes, eRes] = await Promise.all([
        fetch('/api/ads-core/metrics/anti-idle'),
        fetch('/api/ads-core/metrics/efficiency'),
      ])
      const aJson = await aRes.json()
      const eJson = await eRes.json()
      if (!aRes.ok) throw new Error(aJson.error || 'Falha anti-idle')
      if (!eRes.ok) throw new Error(eJson.error || 'Falha eficiência')
      setAnti(aJson.ranking || [])
      setProdRank(eJson.producerRanking || [])
      setNicheStats(eJson.nicheStats || [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const nicheStatsSorted = useMemo(() => {
    const list = [...nicheStats]
    list.sort((a, b) => {
      const ra = a.rejectionRatePct ?? -1
      const rb = b.rejectionRatePct ?? -1
      if (rb !== ra) return rb - ra
      return a.nicheName.localeCompare(b.nicheName, 'pt-BR')
    })
    return list
  }, [nicheStats])

  if (loading) return <p className="text-gray-500">Carregando indicadores…</p>
  if (err) return <p className="text-red-600">{err}</p>

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-primary-500/30 bg-primary-500/[0.06] dark:bg-primary-950/20 p-4 text-sm text-gray-700 dark:text-gray-200">
        <p className="font-semibold text-primary-700 dark:text-primary-300 mb-1">Inteligência, segregação e atribuição</p>
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          Células de nicho isolam congruência (Google G2, Meta Business, TikTok) sobre a mesma base cadastral. Anti-idle
          equilibra carga; pipeline por nicho mostra onde a esteira engasga; taxa de reprovação aponta nichos para
          revisão de estratégia ou briefing.
        </p>
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-2">Dashboard por nicho — pipeline de produção</h2>
        <p className="text-xs text-gray-500 mb-3">
          <strong>Em aberto</strong>: disponível ou em produção. <strong>Em verificação</strong>: enviado à G2/plataforma.
          Ordenação: maior taxa de reprovação primeiro (alerta estratégico).
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 pr-2">Nicho (célula)</th>
              <th className="pb-2 pr-2">Em aberto</th>
              <th className="pb-2 pr-2">Em verificação</th>
              <th className="pb-2 pr-2">Aprovadas</th>
              <th className="pb-2 pr-2">Reprovadas</th>
              <th className="pb-2">Taxa reprovação*</th>
            </tr>
          </thead>
          <tbody>
            {nicheStatsSorted.map((n) => {
              const emG2 = n.emVerificacaoG2 ?? 0
              const emAberto = n.emAberto ?? Math.max(0, n.inProgress - emG2)
              const hot = n.rejectionRatePct != null && n.rejectionRatePct >= 25
              return (
                <tr
                  key={n.nicheId}
                  className={`border-b border-gray-100 dark:border-white/5 ${hot ? 'bg-amber-500/10 dark:bg-amber-950/25' : ''}`}
                >
                  <td className="py-2 pr-2 font-medium">{n.nicheName}</td>
                  <td className="py-2 pr-2 font-mono">{emAberto}</td>
                  <td className="py-2 pr-2 font-mono">{emG2}</td>
                  <td className="py-2 pr-2 font-mono text-green-700 dark:text-green-400">{n.approved}</td>
                  <td className="py-2 pr-2 font-mono text-red-700 dark:text-red-300">{n.rejected}</td>
                  <td className="py-2">
                    {n.rejectionRatePct != null ? (
                      <span className={hot ? 'font-semibold text-amber-800 dark:text-amber-200' : ''}>
                        {n.rejectionRatePct}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-500 mt-2">
          * Taxa = reprovadas / (aprovadas + reprovadas). Linhas destacadas: taxa ≥ 25% (ajustar briefing ou nicho).
        </p>
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-2">Anti-idle (fila em aberto)</h2>
        <p className="text-xs text-gray-500 mb-3">
          Produtores com menos ativos em Disponível / Em produção / Verificação G2 aparecem primeiro — priorize
          novas atribuições para equilibrar a carga.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 pr-2">#</th>
              <th className="pb-2 pr-2">Produtor</th>
              <th className="pb-2">Em aberto</th>
            </tr>
          </thead>
          <tbody>
            {anti.map((r, i) => (
              <tr key={r.producerId} className="border-b border-gray-100 dark:border-white/5">
                <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                <td className="py-2 pr-2">{r.name || r.email}</td>
                <td className="py-2 font-mono">{r.openCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-2">Ranking de produtores — aprovadas (G2 / verificada)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 pr-2">Produtor</th>
              <th className="pb-2 pr-2">Aprovadas</th>
              <th className="pb-2 pr-2">Reprovadas</th>
              <th className="pb-2 pr-2">Na esteira</th>
              <th className="pb-2">Taxa reprovação*</th>
            </tr>
          </thead>
          <tbody>
            {prodRank.map((r) => (
              <tr key={r.producerId} className="border-b border-gray-100 dark:border-white/5">
                <td className="py-2 pr-2">{r.name || r.email}</td>
                <td className="py-2 pr-2 font-mono">{r.approved}</td>
                <td className="py-2 pr-2 font-mono">{r.rejected}</td>
                <td className="py-2 pr-2 font-mono">{r.inProgress}</td>
                <td className="py-2">
                  {r.rejectionRatePct != null ? `${r.rejectionRatePct}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-500 mt-2">
          * Taxa = reprovadas / (aprovadas + reprovadas), quando houver decisão registrada.
        </p>
      </section>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-semibold mb-2">Resumo operacional por nicho (totais na esteira)</h2>
        <p className="text-xs text-gray-500 mb-3">
          Mesmos dados do pipeline, em visão compacta: tudo que ainda não foi aprovado ou reprovado aparece em{' '}
          <strong>Em esteira</strong>.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 pr-2">Nicho</th>
              <th className="pb-2 pr-2">Aprovadas</th>
              <th className="pb-2 pr-2">Reprovadas</th>
              <th className="pb-2 pr-2">Em esteira</th>
              <th className="pb-2">Taxa reprovação*</th>
            </tr>
          </thead>
          <tbody>
            {nicheStats.map((n) => (
              <tr key={n.nicheId} className="border-b border-gray-100 dark:border-white/5">
                <td className="py-2 pr-2">{n.nicheName}</td>
                <td className="py-2 pr-2 font-mono">{n.approved}</td>
                <td className="py-2 pr-2 font-mono">{n.rejected}</td>
                <td className="py-2 pr-2 font-mono">{n.inProgress}</td>
                <td className="py-2">
                  {n.rejectionRatePct != null ? `${n.rejectionRatePct}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-500 mt-2">
          * Mesma definição de taxa de reprovação (aprovadas + reprovadas = base da porcentagem).
        </p>
      </section>
    </div>
  )
}
