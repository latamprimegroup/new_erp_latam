'use client'

import { useState, useEffect, useCallback } from 'react'

const REJECTION_CODES = [
  { value: 'DOC_INVALIDO', label: 'Documento inválido' },
  { value: 'EMAIL_BLOQUEADO', label: 'E-mail bloqueado' },
  { value: 'CNPJ_INVALIDO', label: 'CNPJ inválido' },
  { value: 'PAGAMENTO_RECUSADO', label: 'Pagamento recusado' },
  { value: 'DADOS_INCONSISTENTES', label: 'Dados inconsistentes' },
  { value: 'OUTRO', label: 'Outro' },
]

type PorMotivoRow = { motivo: string; quantidade: number; percentualReprovados?: number }

type DailyQ = {
  data: string
  total: number
  aprovadas: number
  reprovadas: number
  taxaSucesso: number
}

type ByProducerRow = {
  producerId: string
  name: string | null
  total: number
  aprovadas: number
  reprovadas: number
  taxaSucesso: number
  abaixoDaMeta: boolean
}

type ComparativoAnterior = {
  periodo: { start: string; end: string }
  label: string
  total: number
  aprovadas: number
  reprovadas: number
  taxaSucesso: number
}

type Metrics = {
  periodo: { start: string; end: string }
  escopo?: string
  total: number
  aprovadas: number
  reprovadas: number
  taxaSucesso: number
  porMotivo: PorMotivoRow[]
  dailyQuality: DailyQ[]
  byProducer: ByProducerRow[]
  meta: { taxaMinima: number; minAmostra: number }
  alertaBaixaTaxa: boolean
  produtoresAbaixoDaMeta: ByProducerRow[]
  comparativoAnterior?: ComparativoAnterior | null
  tempoMedioHorasPorAprovada?: number | null
  amostraTempoAprovadas?: number
}

function motivoLabel(code: string) {
  return REJECTION_CODES.find((c) => c.value === code)?.label || code
}

const PIE_COLORS = [
  'rgb(239 68 68)',
  'rgb(249 115 22)',
  'rgb(234 179 8)',
  'rgb(34 197 94)',
  'rgb(59 130 246)',
  'rgb(139 92 246)',
  'rgb(100 116 139)',
]

function RejectionPieChart({ rows }: { rows: PorMotivoRow[] }) {
  const total = rows.reduce((s, r) => s + r.quantidade, 0)
  if (total < 1) return null
  const cx = 90
  const cy = 90
  const radius = 78
  let acc = 0
  const slices = rows.map((row, i) => {
    const frac = row.quantidade / total
    const start = acc * 2 * Math.PI - Math.PI / 2
    acc += frac
    const end = acc * 2 * Math.PI - Math.PI / 2
    const x1 = cx + radius * Math.cos(start)
    const y1 = cy + radius * Math.sin(start)
    const x2 = cx + radius * Math.cos(end)
    const y2 = cy + radius * Math.sin(end)
    const large = frac > 0.5 ? 1 : 0
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
    return (
      <path
        key={row.motivo}
        d={d}
        fill={PIE_COLORS[i % PIE_COLORS.length]}
        className="stroke-gray-900/20 dark:stroke-white/15"
        strokeWidth={1}
      />
    )
  })
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 180 180" className="w-44 h-44 shrink-0" aria-hidden>
        {slices}
      </svg>
      <ul className="w-full space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
        {rows.map((row, i) => (
          <li key={row.motivo} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="truncate flex-1" title={motivoLabel(row.motivo)}>
              {motivoLabel(row.motivo)}
            </span>
            <span className="shrink-0 font-medium">
              {row.quantidade} ({row.percentualReprovados ?? 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function downloadMetricsExport(payload: Metrics) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `producao-metricas-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function QualityTimeline({ days, metaTaxa }: { days: DailyQ[]; metaTaxa: number }) {
  if (days.length === 0) return null
  if (days.length === 1) {
    const d = days[0]
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')}: taxa {d.taxaSucesso}% (meta {metaTaxa}
        %). {d.aprovadas} aprovadas / {d.total} criadas.
      </p>
    )
  }
  const w = 320
  const h = 100
  const pad = 8
  const maxY = 100
  const pts = days.map((d, i) => {
    const x = pad + (i / Math.max(days.length - 1, 1)) * (w - pad * 2)
    const y = pad + (1 - d.taxaSucesso / maxY) * (h - pad * 2)
    return `${x},${y}`
  })
  const line = pts.join(' ')
  const metaY = pad + (1 - metaTaxa / maxY) * (h - pad * 2)
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-2xl h-28" preserveAspectRatio="xMidYMid meet">
        <line
          x1={pad}
          y1={metaY}
          x2={w - pad}
          y2={metaY}
          stroke="currentColor"
          className="text-amber-500/60"
          strokeDasharray="4 3"
          strokeWidth="1"
        />
        <text x={pad + 2} y={metaY - 4} className="fill-amber-600 dark:fill-amber-400 text-[9px]">
          Meta {metaTaxa}%
        </text>
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          className="text-primary-500"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-gray-400 mt-1">
        {days.map((d) => (
          <span key={d.data} title={`${d.aprovadas} apr. / ${d.reprovadas} rep.`}>
            {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}:{' '}
            {d.taxaSucesso}%
          </span>
        ))}
      </div>
    </div>
  )
}

function HorizontalBars({
  rows,
  maxVal,
  valueSuffix = '',
  barClass,
}: {
  rows: { key: string; label: string; value: number; hint?: string }[]
  maxVal: number
  valueSuffix?: string
  barClass: string
}) {
  const max = Math.max(maxVal, 1)
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 gap-2">
            <span className="truncate" title={r.hint}>
              {r.label}
            </span>
            <span className="shrink-0 font-medium">
              {r.value}
              {valueSuffix}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden mt-1">
            <div
              className={`h-full rounded-full transition-all ${barClass}`}
              style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ProducaoMetricsClient({ isOversight = false }: { isOversight?: boolean }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [producerId, setProducerId] = useState('')
  const [producers, setProducers] = useState<Array<{ id: string; name: string | null }>>([])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ period })
    if (isOversight && producerId) params.set('producerId', producerId)
    fetch(`/api/producao/metrics?${params}`)
      .then((r) => r.json())
      .then(setMetrics)
      .finally(() => setLoading(false))
  }, [period, producerId, isOversight])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (isOversight) {
      fetch('/api/admin/producers')
        .then((r) => r.json())
        .then((d) => setProducers(d.users || []))
        .catch(() => setProducers([]))
    }
  }, [isOversight])

  if (loading && !metrics) return <p className="text-gray-500 dark:text-gray-400 py-4">Carregando métricas...</p>

  const m = metrics || {
    total: 0,
    aprovadas: 0,
    reprovadas: 0,
    taxaSucesso: 0,
    porMotivo: [],
    dailyQuality: [],
    byProducer: [],
    meta: { taxaMinima: 80, minAmostra: 10 },
    alertaBaixaTaxa: false,
    produtoresAbaixoDaMeta: [],
    comparativoAnterior: null,
    tempoMedioHorasPorAprovada: null,
    amostraTempoAprovadas: 0,
  }

  const maxMotivo = Math.max(...m.porMotivo.map((x) => x.quantidade), 1)
  const motivoBars = m.porMotivo.map((row) => ({
    key: row.motivo,
    label: motivoLabel(row.motivo),
    value: row.quantidade,
    hint: `${row.percentualReprovados ?? 0}% das reprovações`,
  }))

  const prodBars = m.byProducer.map((p) => ({
    key: p.producerId,
    label: p.name || p.producerId.slice(0, 8),
    value: p.taxaSucesso,
    hint: `${p.aprovadas}/${p.total} aprovadas`,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="input-field w-44"
        >
          <option value="day">Hoje</option>
          <option value="week">Últimos 7 dias</option>
          <option value="month">Mês atual</option>
          <option value="year">Ano atual</option>
        </select>
        <button
          type="button"
          onClick={() => metrics && downloadMetricsExport(metrics)}
          disabled={!metrics}
          className="btn-secondary text-sm disabled:opacity-50"
        >
          Exportar relatório (JSON)
        </button>
        {isOversight && producers.length > 0 && (
          <select
            value={producerId}
            onChange={(e) => setProducerId(e.target.value)}
            className="input-field w-52"
          >
            <option value="">Todos os produtores</option>
            {producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        )}
      </div>

      {(m.alertaBaixaTaxa || (isOversight && m.produtoresAbaixoDaMeta.length > 0)) && (
        <div
          className="rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/25 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          role="alert"
        >
          <p className="font-semibold">Alerta de taxa de sucesso</p>
          {m.alertaBaixaTaxa && (
            <p className="mt-1">
              A taxa global do filtro atual ({m.taxaSucesso}%) está abaixo da meta mínima ({m.meta.taxaMinima}%), com
              amostra ≥ {m.meta.minAmostra} contas. Avalie treinamento ou causas operacionais.
            </p>
          )}
          {isOversight && m.produtoresAbaixoDaMeta.length > 0 && (
            <p className="mt-2">
              <span className="font-medium">Produtores abaixo da meta:</span>{' '}
              {m.produtoresAbaixoDaMeta.map((p) => p.name || p.producerId.slice(0, 8)).join(', ')}.
            </p>
          )}
          <p className="text-xs mt-2 opacity-80">
            Ajuste em sistema: chaves <code className="text-[11px]">producao_metrica_taxa_sucesso_min</code> e{' '}
            <code className="text-[11px]">producao_metrica_min_amostra</code> (padrão 80% e 10 contas).
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total criadas</p>
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{m.total}</p>
        </div>
        <div className="card border-l-4 border-l-green-500">
          <p className="text-sm text-gray-500 dark:text-gray-400">Aprovadas</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{m.aprovadas}</p>
        </div>
        <div className="card border-l-4 border-l-red-500">
          <p className="text-sm text-gray-500 dark:text-gray-400">Reprovadas</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{m.reprovadas}</p>
        </div>
        <div className="card border-l-4 border-l-blue-500">
          <p className="text-sm text-gray-500 dark:text-gray-400">Taxa de sucesso</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{m.taxaSucesso}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Meta ≥ {m.meta.taxaMinima}%</p>
        </div>
      </div>

      {(m.comparativoAnterior != null || m.tempoMedioHorasPorAprovada != null) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {m.comparativoAnterior && (
            <div className="card">
              <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">Comparativo de períodos</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{m.comparativoAnterior.label}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">Taxa atual</p>
                  <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{m.taxaSucesso}%</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">Taxa período anterior</p>
                  <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                    {m.comparativoAnterior.taxaSucesso}%
                  </p>
                </div>
                <div className="col-span-2 pt-1 border-t border-gray-200 dark:border-white/10">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Variação em pontos percentuais:{' '}
                    <span
                      className={
                        m.taxaSucesso - m.comparativoAnterior.taxaSucesso >= 0
                          ? 'text-green-600 dark:text-green-400 font-medium'
                          : 'text-red-600 dark:text-red-400 font-medium'
                      }
                    >
                      {m.taxaSucesso - m.comparativoAnterior.taxaSucesso >= 0 ? '+' : ''}
                      {m.taxaSucesso - m.comparativoAnterior.taxaSucesso} pp
                    </span>
                    {' · '}
                    Criadas: {m.total} (antes {m.comparativoAnterior.total})
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="card">
            <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">Tempo até aprovação</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Média de horas entre criação da conta e conferência (aprovadas com data de validação).
            </p>
            {m.tempoMedioHorasPorAprovada != null ? (
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {m.tempoMedioHorasPorAprovada} h
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                  (n = {m.amostraTempoAprovadas ?? 0})
                </span>
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sem amostra no período — a métrica aparece quando houver aprovadas conferidas (
                <code className="text-[11px]">validatedAt</code>).
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {m.porMotivo.length > 0 && (
          <div className="card lg:col-span-2">
            <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">
              Motivos de reprovação
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Distribuição (pizza) e volume (barras); % referem-se ao total de reprovadas no período.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Distribuição</p>
                <RejectionPieChart rows={m.porMotivo} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Ranking por volume</p>
                <HorizontalBars
                  rows={motivoBars}
                  maxVal={maxMotivo}
                  barClass="bg-red-500/80 dark:bg-red-500/70"
                />
              </div>
            </div>
          </div>
        )}

        {isOversight && !producerId && m.byProducer.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">
              Comparativo — taxa de sucesso por produtor
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Barras proporcionais à taxa (0–100%). Passe o rato para ver aprovadas/total.
            </p>
            <HorizontalBars
              rows={prodBars}
              maxVal={100}
              valueSuffix="%"
              barClass="bg-primary-500/85 dark:bg-primary-500/70"
            />
          </div>
        )}

        {m.porMotivo.length === 0 &&
          !(isOversight && !producerId && m.byProducer.length > 0) &&
          m.dailyQuality.length === 0 && (
            <div className="card text-sm text-gray-500 dark:text-gray-400 lg:col-span-2">
              Sem reprovações ou série diária neste período. Os KPIs acima refletem o volume total.
            </div>
          )}
      </div>

      {m.dailyQuality.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">
            Linha do tempo de qualidade (taxa de sucesso por dia)
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Tendência diária; quedas bruscas podem coincidir com mudanças nas plataformas ou no processo.
          </p>
          <QualityTimeline days={m.dailyQuality} metaTaxa={m.meta.taxaMinima} />
        </div>
      )}
    </div>
  )
}

