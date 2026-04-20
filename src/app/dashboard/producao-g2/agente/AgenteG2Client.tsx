'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Award, Medal, ShieldCheck } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

type Meta = {
  metaMaxima: number
  producaoAtual: number
  producaoDiariaMedia: number
  diasRestantes: number
  producaoDiariaNecessaria: number
  projecao: number
  metaEmRisco: boolean
  percentual: number
  bonusAtual: number
  bonusProjetado: number
  previsaoTotalSeBaterMeta?: number
}

type G2RankingBadge = 'PODIO_OURO' | 'PODIO_PRATA' | 'PODIO_BRONZE' | 'ZERO_REPROVACOES'

type RankItem = {
  producerId: string
  name: string | null
  count: number
  rank: number
  badges: G2RankingBadge[]
}

type AlertItem = {
  id: string
  type: string
  severity: string
  message: string
  resolvedAt: string | null
  createdAt: string
  producer: { name: string | null }
}

type TrendPayload = {
  series: { date: string; label: string; count: number }[]
  avgLast7: number
  avgPrev7: number
  trendPercent: number | null
}

type FeedbackRow = {
  id: string
  body: string
  createdAt: string
  author: { name: string | null }
  producer?: { name: string | null }
}

const BADGE_META: Record<G2RankingBadge, { label: string; icon: 'gold' | 'silver' | 'bronze' | 'shield' }> = {
  PODIO_OURO: { label: 'Produtor Ouro', icon: 'gold' },
  PODIO_PRATA: { label: 'Produtor Prata', icon: 'silver' },
  PODIO_BRONZE: { label: 'Produtor Bronze', icon: 'bronze' },
  ZERO_REPROVACOES: { label: 'Zero reprovações', icon: 'shield' },
}

function BadgeChip({ badge }: { badge: G2RankingBadge }) {
  const m = BADGE_META[badge]
  const Icon =
    m.icon === 'shield' ? (
      <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
    ) : (
      <Medal className="w-3.5 h-3.5 shrink-0" aria-hidden />
    )
  const color =
    m.icon === 'gold'
      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40'
      : m.icon === 'silver'
        ? 'bg-slate-400/20 text-slate-800 dark:text-slate-200 border-slate-400/40'
        : m.icon === 'bronze'
          ? 'bg-orange-600/20 text-orange-900 dark:text-orange-200 border-orange-600/40'
          : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/35'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color}`}
      title={m.label}
    >
      {Icon}
      {m.label}
    </span>
  )
}

function TrendSparkline({ series, isDark }: { series: { count: number }[]; isDark: boolean }) {
  if (series.length < 2) return null
  const max = Math.max(...series.map((s) => s.count), 1)
  const w = 200
  const h = 56
  const pad = 4
  const pts = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2)
    const y = h - pad - (s.count / max) * (h - pad * 2)
    return `${x},${y}`
  })
  const stroke = isDark ? '#60a5fa' : '#2563eb'
  const fill = isDark ? 'rgba(96,165,250,0.12)' : 'rgba(37,99,235,0.08)'
  const line = pts.join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full max-w-md h-16"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polygon points={area} fill={fill} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function AgenteG2Client() {
  const { data: session } = useSession()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const role = session?.user?.role
  const isProducer = role === 'PRODUCER'
  const canPostFeedback =
    role === 'ADMIN' || role === 'FINANCE' || role === 'PRODUCTION_MANAGER'

  const [meta, setMeta] = useState<Meta | null>(null)
  const [ranking, setRanking] = useState<RankItem[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [alertsHistory, setAlertsHistory] = useState<AlertItem[]>([])
  const [trend, setTrend] = useState<TrendPayload | null>(null)
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [producers, setProducers] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [feedbackProducerId, setFeedbackProducerId] = useState('')
  const [feedbackBody, setFeedbackBody] = useState('')
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [supportBody, setSupportBody] = useState('')
  const [supportSending, setSupportSending] = useState(false)
  const [recoveryExtra, setRecoveryExtra] = useState('')
  const [loading, setLoading] = useState(true)

  const producerParam = isProducer && session?.user?.id ? `producerId=${encodeURIComponent(session.user.id)}` : ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const metaUrl = producerParam
        ? `/api/production-g2/agent/meta?${producerParam}`
        : '/api/production-g2/agent/meta'
      const trendUrl = producerParam
        ? `/api/production-g2/agent/trend?${producerParam}`
        : '/api/production-g2/agent/trend'

      const alertsActiveUrl = producerParam
        ? `/api/production-g2/agent/alerts?resolved=false&${producerParam}`
        : '/api/production-g2/agent/alerts?resolved=false'
      const alertsHistUrl = producerParam
        ? `/api/production-g2/agent/alerts?resolved=true&${producerParam}`
        : '/api/production-g2/agent/alerts?resolved=true'

      const [metaRes, rankRes, alertsRes, alertsHistRes, trendRes, fbRes] = await Promise.all([
        fetch(metaUrl),
        fetch('/api/production-g2/agent/ranking'),
        fetch(alertsActiveUrl),
        fetch(alertsHistUrl),
        fetch(trendUrl),
        fetch('/api/production-g2/agent/feedback'),
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
      if (alertsHistRes.ok) {
        const d = await alertsHistRes.json()
        setAlertsHistory(d.alerts || [])
      } else {
        setAlertsHistory([])
      }
      if (trendRes.ok) setTrend(await trendRes.json())
      else setTrend(null)
      if (fbRes.ok) {
        const d = await fbRes.json()
        setFeedback(d.feedback || [])
      }
    } catch {
      setMeta(null)
      setRanking([])
      setAlerts([])
      setAlertsHistory([])
      setTrend(null)
      setFeedback([])
    }
    setLoading(false)
  }, [producerParam, isProducer, session?.user?.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!canPostFeedback) return
    fetch('/api/admin/producers')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.users)) setProducers(d.users)
      })
      .catch(() => {})
  }, [canPostFeedback])

  async function submitSupport(e: React.FormEvent) {
    e.preventDefault()
    if (!supportBody.trim()) return
    setSupportSending(true)
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'SYSTEM',
          title: '[Agente G2] Pedido de suporte',
          description: supportBody.trim().slice(0, 8000),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setSupportBody('')
        alert(data.message || 'Chamado registrado. A gestão será notificada.')
      } else {
        alert(typeof data.error === 'string' ? data.error : 'Erro ao enviar')
      }
    } finally {
      setSupportSending(false)
    }
  }

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!feedbackProducerId || !feedbackBody.trim()) return
    setFeedbackSending(true)
    try {
      const res = await fetch('/api/production-g2/agent/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producerId: feedbackProducerId, body: feedbackBody.trim() }),
      })
      if (res.ok) {
        setFeedbackBody('')
        const list = await fetch('/api/production-g2/agent/feedback').then((r) => r.json())
        setFeedback(list.feedback || [])
      } else {
        const err = await res.json()
        alert(err.error || 'Erro ao enviar')
      }
    } finally {
      setFeedbackSending(false)
    }
  }

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

  const card = isDark ? 'bg-[#151d2e] border-white/10' : 'bg-white border-gray-200'
  const textMain = isDark ? 'text-gray-100' : 'text-slate-800'
  const textMuted = isDark ? 'text-gray-400' : 'text-slate-500'

  if (loading) {
    return (
      <div className="space-y-4">
        <div className={`card animate-pulse h-32 rounded-xl border ${card}`} />
        <div className="grid md:grid-cols-2 gap-4">
          <div className={`card animate-pulse h-48 rounded-xl border ${card}`} />
          <div className={`card animate-pulse h-48 rounded-xl border ${card}`} />
        </div>
      </div>
    )
  }

  const myRankEntry =
    isProducer && session?.user?.id ? ranking.find((r) => r.producerId === session.user.id) : undefined

  const recoveryExtraN = Math.max(0, Math.min(500, parseInt(recoveryExtra, 10) || 0))
  const recoveryNewNeeded =
    meta && meta.diasRestantes > 0
      ? Math.max(
          0,
          Math.ceil((meta.metaMaxima - (meta.producaoAtual + recoveryExtraN)) / meta.diasRestantes)
        )
      : null

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/producao-g2"
        className="text-primary-600 dark:text-primary-400 hover:underline text-sm"
      >
        ← Voltar para Produção G2
      </Link>

      {isProducer && session?.user?.name && (
        <div className={`text-sm ${textMain}`}>
          <span className="font-semibold">{session.user.name}</span>
          {myRankEntry ? (
            <span className={`ml-2 ${textMuted}`}>
              {myRankEntry.rank === 1
                ? '🥇'
                : myRankEntry.rank === 2
                  ? '🥈'
                  : myRankEntry.rank === 3
                    ? '🥉'
                    : '🏅'}{' '}
              Top {myRankEntry.rank} · {myRankEntry.count} validada(s) no mês
            </span>
          ) : ranking.length > 0 ? (
            <span className={`ml-2 ${textMuted}`}>— ainda fora do ranking (0 validadas no mês)</span>
          ) : null}
        </div>
      )}

      {meta && (
        <div
          className={`card border-2 rounded-xl p-5 ${
            meta.metaEmRisco
              ? 'border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/25 dark:border-amber-500/50'
              : 'border-emerald-300/70 bg-emerald-50/30 dark:bg-emerald-950/20 dark:border-emerald-500/40'
          }`}
        >
          <h2 className={`font-semibold mb-3 ${textMain}`}>
            {meta.metaEmRisco ? '⚠ Meta em risco' : '✓ Meta no ritmo'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className={`text-xs ${textMuted}`}>Produção / Meta</p>
              <p className="text-xl font-bold text-primary-600 dark:text-primary-400">
                {meta.producaoAtual} / {meta.metaMaxima}
              </p>
              <p className={`text-sm ${textMuted}`}>{meta.percentual}%</p>
            </div>
            <div>
              <p className={`text-xs ${textMuted}`}>Projeção</p>
              <p className={`text-xl font-bold ${textMain}`}>{meta.projecao}</p>
            </div>
            <div>
              <p className={`text-xs ${textMuted}`}>Ritmo médio/dia</p>
              <p className={`text-xl font-bold ${textMain}`}>{meta.producaoDiariaMedia}</p>
            </div>
            <div>
              <p className={`text-xs ${textMuted}`}>Necessário/dia</p>
              <p
                className={`text-xl font-bold ${
                  meta.metaEmRisco ? 'text-amber-600 dark:text-amber-400' : textMain
                }`}
              >
                {meta.producaoDiariaNecessaria}
              </p>
            </div>
            <div>
              <p className={`text-xs ${textMuted}`}>Dias restantes</p>
              <p className={`text-xl font-bold text-sky-500 dark:text-sky-400`}>{meta.diasRestantes}</p>
            </div>
          </div>
          {isProducer && meta.diasRestantes > 0 && (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                isDark ? 'border-white/10 bg-white/5' : 'border-amber-200/60 bg-amber-50/40'
              }`}
            >
              <p className={`font-medium mb-2 ${textMain}`}>Calculadora de recuperação (referência)</p>
              <p className={`text-xs mb-2 ${textMuted}`}>
                Simula quantas contas validadas a mais você somaria ao mês; o &quot;necessário/dia&quot; é
                recalculado como na meta global (aproximação).
              </p>
              <label className={`flex flex-wrap items-center gap-2 ${textMuted}`}>
                <span>Se eu validar mais</span>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={recoveryExtra}
                  onChange={(e) => setRecoveryExtra(e.target.value)}
                  className="input-field w-20 py-1 text-sm"
                  aria-label="Contas extras validadas (simulação)"
                />
                <span>contas neste mês, necessário/dia cai para</span>
                <span className={`font-bold text-amber-600 dark:text-amber-400`}>
                  {recoveryNewNeeded ?? meta.producaoDiariaNecessaria}
                </span>
                <span className="text-xs">(hoje: {meta.producaoDiariaNecessaria})</span>
              </label>
            </div>
          )}
          {isProducer && (meta.previsaoTotalSeBaterMeta ?? 0) > 0 && (
            <p className={`text-xs mt-3 ${textMuted}`}>
              Previsão de ganhos totais se atingir {meta.metaMaxima} validadas no mês:{' '}
              <span className="font-semibold text-primary-600 dark:text-primary-400">
                {fmtMoney(meta.previsaoTotalSeBaterMeta ?? 0)}
              </span>
            </p>
          )}
          <div
            className={`mt-4 flex flex-wrap gap-4 items-center rounded-lg border px-4 py-3 ${
              isDark ? 'border-white/10 bg-white/5' : 'border-primary-200/60 bg-primary-50/50'
            }`}
          >
            <Award className="w-5 h-5 text-primary-500 shrink-0" aria-hidden />
            {isProducer ? (
              <>
                <div>
                  <p className={`text-xs ${textMuted}`}>Bônus na faixa atual (mês)</p>
                  <p className={`text-lg font-bold ${textMain}`}>{fmtMoney(meta.bonusAtual ?? 0)}</p>
                </div>
                <div className="h-8 w-px bg-gray-300 dark:bg-white/15 hidden sm:block" />
                <div>
                  <p className={`text-xs ${textMuted}`}>Bônus projetado (se o ritmo se mantiver)</p>
                  <p className={`text-lg font-bold text-primary-600 dark:text-primary-400`}>
                    {fmtMoney(meta.bonusProjetado ?? 0)}
                  </p>
                </div>
                <p className={`text-[11px] w-full sm:w-auto sm:ml-auto ${textMuted}`}>
                  Conforme faixas em produção (200 / 250 / 300 / meta / elite).
                </p>
              </>
            ) : (
              <p className={`text-sm ${textMuted}`}>
                Estimativa de bônus individual aparece para o produtor quando ele acessa este painel (meta
                filtrada ao próprio ID).
              </p>
            )}
          </div>
        </div>
      )}

      {trend && trend.series.length > 0 && (
        <div className={`card rounded-xl border p-4 ${card}`}>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
            <div>
              <h2 className={`font-semibold ${textMain}`}>Tendência de ritmo (14 dias)</h2>
              <p className={`text-xs mt-1 ${textMuted}`}>
                Contas validadas por dia — últimos 7 dias vs. 7 dias anteriores.
              </p>
            </div>
            {trend.trendPercent !== null && (
              <p
                className={`text-sm font-bold ${
                  trend.trendPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {trend.trendPercent >= 0 ? '↑' : '↓'} {Math.abs(trend.trendPercent)}% vs. semana anterior
              </p>
            )}
          </div>
          <TrendSparkline series={trend.series} isDark={isDark} />
          <p className={`text-xs mt-2 ${textMuted}`}>
            Média últimos 7 dias: {trend.avgLast7} / dia · Semana anterior: {trend.avgPrev7} / dia
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className={`card rounded-xl border p-4 ${card}`}>
          <h2 className={`font-semibold mb-3 flex items-center gap-2 ${textMain}`}>
            <span aria-hidden>🏆</span> Ranking do mês
          </h2>
          {ranking.length === 0 ? (
            <p className={`text-sm ${textMuted}`}>Nenhum dado ainda</p>
          ) : (
            <ul className="space-y-3">
              {ranking.slice(0, 10).map((r) => (
                <li
                  key={r.producerId}
                  className={`flex flex-col gap-2 py-2 border-b last:border-0 ${
                    isDark ? 'border-white/10' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          r.rank === 1
                            ? 'bg-amber-500/30 text-amber-100'
                            : r.rank === 2
                              ? 'bg-slate-400/30 text-slate-100'
                              : r.rank === 3
                                ? 'bg-orange-600/30 text-orange-100'
                                : isDark
                                  ? 'bg-white/10 text-gray-300'
                                  : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.rank}
                      </span>
                      <span className={`truncate font-medium ${textMain}`}>
                        {r.rank === 1 ? '🥇 ' : r.rank === 2 ? '🥈 ' : r.rank === 3 ? '🥉 ' : ''}
                        {r.name || 'Sem nome'}
                      </span>
                    </span>
                    <span className="font-semibold text-primary-600 dark:text-primary-400 shrink-0">
                      {r.count} contas
                    </span>
                  </div>
                  {r.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-9">
                      {r.badges.map((b) => (
                        <BadgeChip key={b} badge={b} />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`card rounded-xl border p-4 ${card}`}>
          <h2 className={`font-semibold mb-3 flex items-center gap-2 ${textMain}`}>
            <span aria-hidden>🔔</span> Alertas ativos
          </h2>
          {alerts.length === 0 ? (
            <p className={`text-sm ${textMuted}`}>Nenhum alerta pendente</p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 10).map((a) => (
                <li
                  key={a.id}
                  className={`p-3 rounded-lg text-sm ${
                    a.severity === 'CRITICAL'
                      ? 'bg-red-500/15 text-red-100 border border-red-500/30'
                      : a.severity === 'WARNING'
                        ? 'bg-amber-500/15 text-amber-100 border border-amber-500/25'
                        : isDark
                          ? 'bg-white/5 text-gray-200 border border-white/10'
                          : 'bg-slate-50 text-slate-700 border border-slate-100'
                  }`}
                >
                  <p className="font-medium">{a.type}</p>
                  <p>{a.message}</p>
                  <p className={`text-xs mt-1 opacity-80`}>
                    {a.producer?.name} · {new Date(a.createdAt).toLocaleString('pt-BR')}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {alertsHistory.length > 0 && (
            <details className={`mt-4 ${textMain}`}>
              <summary className={`text-sm cursor-pointer ${textMuted} hover:opacity-90`}>
                Histórico de alertas (resolvidos) — {alertsHistory.length} recente(s)
              </summary>
              <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {alertsHistory.slice(0, 25).map((a) => (
                  <li
                    key={a.id}
                    className={`p-2 rounded text-xs ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}
                  >
                    <p className="font-medium">{a.type}</p>
                    <p className={textMuted}>{a.message}</p>
                    <p className={`mt-1 ${textMuted}`}>
                      {new Date(a.createdAt).toLocaleString('pt-BR')}
                      {a.resolvedAt && ` → resolvido ${new Date(a.resolvedAt).toLocaleString('pt-BR')}`}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {isProducer && (
            <form onSubmit={submitSupport} className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <h3 className={`text-sm font-semibold mb-1 ${textMain}`}>Pedir suporte</h3>
              <p className={`text-xs mb-2 ${textMuted}`}>
                Descreva o erro ou a falha técnica. O pedido é registrado como sugestão ao sistema (categoria
                técnica).
              </p>
              <textarea
                value={supportBody}
                onChange={(e) => setSupportBody(e.target.value)}
                className="input-field w-full text-sm min-h-[72px]"
                placeholder="Ex.: Erro ao salvar documento na tarefa G2-…"
                maxLength={8000}
                required
              />
              <button type="submit" disabled={supportSending} className="btn-primary text-sm mt-2">
                {supportSending ? 'Enviando…' : 'Enviar pedido de suporte'}
              </button>
            </form>
          )}

          <div
            className={`mt-6 pt-4 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}
          >
            <h3 className={`text-sm font-semibold mb-2 ${textMain}`}>Comentários do gestor</h3>
            <p className={`text-xs mb-3 ${textMuted}`}>
              Feedback sobre qualidade e prioridades — visível para o produtor na lista abaixo.
            </p>
            {feedback.length === 0 ? (
              <p className={`text-sm ${textMuted}`}>Nenhum comentário recente.</p>
            ) : (
              <ul className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {feedback.map((f) => (
                  <li
                    key={f.id}
                    className={`text-sm rounded-lg p-3 ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}
                  >
                    <p className={textMain}>{f.body}</p>
                    <p className={`text-xs mt-1 ${textMuted}`}>
                      {f.author?.name || 'Gestor'} · {new Date(f.createdAt).toLocaleString('pt-BR')}
                      {canPostFeedback && f.producer?.name && ` · ${f.producer.name}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canPostFeedback && (
              <form onSubmit={submitFeedback} className="space-y-2">
                <label className={`block text-xs font-medium ${textMuted}`}>Enviar para produtor</label>
                <select
                  value={feedbackProducerId}
                  onChange={(e) => setFeedbackProducerId(e.target.value)}
                  className="input-field w-full text-sm"
                  required
                >
                  <option value="">Selecione…</option>
                  {producers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.email}
                    </option>
                  ))}
                </select>
                <textarea
                  value={feedbackBody}
                  onChange={(e) => setFeedbackBody(e.target.value)}
                  className="input-field w-full text-sm min-h-[80px]"
                  placeholder="Ex.: Reforçar checagem de proxy nas contas da semana…"
                  maxLength={4000}
                  required
                />
                <button type="submit" disabled={feedbackSending} className="btn-primary text-sm">
                  {feedbackSending ? 'Enviando…' : 'Publicar comentário'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
