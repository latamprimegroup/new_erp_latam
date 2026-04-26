/**
 * GET /api/admin/pos-venda/saude
 *
 * Dashboard de Saúde dos Ativos por Fornecedor/Executor.
 * Retorna:
 *  - Ranking de fornecedores/executores por taxa de substituição
 *  - Distribuição de motivos de substituição
 *  - Métricas de tempo de vida das contas (median lifetime)
 *  - Alertas de lotes com alta taxa de falha (> threshold)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DEFAULT_DAYS = 30
const ALERT_THRESHOLD_PCT = 30  // % de substituição que dispara alerta

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  const daysParam = Number.parseInt(req.nextUrl.searchParams.get('days') ?? String(DEFAULT_DAYS), 10)
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : DEFAULT_DAYS
  const since = new Date(Date.now() - days * 24 * 3_600_000)

  // 1. Busca todas as credenciais criadas no período
  const credentials = await prisma.quickSaleCredential.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id:               true,
      assetOrigin:      true,
      executorName:     true,
      supplierName:     true,
      assetStatus:      true,
      replacementReason: true,
      createdAt:        true,
      replacedAt:       true,
      checkoutId:       true,
      checkout: {
        select: {
          paidAt:   true,
          warrantyEndsAt: true,
          listing: { select: { title: true, assetCategory: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // 2. Agrupa por fornecedor/executor
  type ProducerKey = string

  interface ProducerStats {
    name:       string
    origin:     string
    total:      number
    replaced:   number
    active:     number
    suspended:  number
    lifetimes:  number[]   // horas até substituição
    reasons:    Record<string, number>
  }

  const statsMap = new Map<ProducerKey, ProducerStats>()

  for (const cred of credentials) {
    const name   = (cred.assetOrigin === 'INTERNAL' ? cred.executorName : cred.supplierName) ?? 'Sem identificação'
    const origin = cred.assetOrigin
    const key    = `${origin}::${name}`

    if (!statsMap.has(key)) {
      statsMap.set(key, { name, origin, total: 0, replaced: 0, active: 0, suspended: 0, lifetimes: [], reasons: {} })
    }

    const s = statsMap.get(key)!
    s.total++

    if (cred.assetStatus === 'REPLACED') {
      s.replaced++
      if (cred.replacementReason) {
        s.reasons[cred.replacementReason] = (s.reasons[cred.replacementReason] ?? 0) + 1
      }
      // Calcula lifetime em horas (replacedAt - createdAt)
      if (cred.replacedAt) {
        const lifetimeHours = (cred.replacedAt.getTime() - cred.createdAt.getTime()) / 3_600_000
        s.lifetimes.push(Math.max(0, lifetimeHours))
      }
    } else if (cred.assetStatus === 'DELIVERED' || cred.assetStatus === 'WARMING') {
      s.active++
    } else if (cred.assetStatus === 'SUSPENDED') {
      s.suspended++
    }
  }

  // 3. Formata ranking
  const ranking = Array.from(statsMap.values())
    .map((s) => {
      const replacementPct = s.total > 0 ? Math.round((s.replaced / s.total) * 100) : 0
      const avgLifetimeDays = s.lifetimes.length > 0
        ? Math.round(s.lifetimes.reduce((a, b) => a + b, 0) / s.lifetimes.length / 24 * 10) / 10
        : null
      const medianLifetimeDays = s.lifetimes.length > 0
        ? (() => {
            const sorted = [...s.lifetimes].sort((a, b) => a - b)
            const mid    = Math.floor(sorted.length / 2)
            const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
            return Math.round(median / 24 * 10) / 10
          })()
        : null
      const topReason = Object.entries(s.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      const alert     = s.total >= 3 && replacementPct >= ALERT_THRESHOLD_PCT

      return {
        name:              s.name,
        origin:            s.origin,
        total:             s.total,
        replaced:          s.replaced,
        active:            s.active,
        suspended:         s.suspended,
        replacementPct,
        avgLifetimeDays,
        medianLifetimeDays,
        reasons:           s.reasons,
        topReason,
        alert,
      }
    })
    .sort((a, b) => b.total - a.total)

  // 4. Distribuição global de motivos de substituição
  const replacedCreds = credentials.filter((c) => c.assetStatus === 'REPLACED')
  const globalReasons: Record<string, number> = {}
  for (const c of replacedCreds) {
    if (c.replacementReason) {
      globalReasons[c.replacementReason] = (globalReasons[c.replacementReason] ?? 0) + 1
    }
  }

  // 5. Timeline semanal de substituições (últimas 8 semanas)
  const weeklyData: Array<{ week: string; replaced: number; total: number }> = []
  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(Date.now() - (w + 1) * 7 * 24 * 3_600_000)
    const weekEnd   = new Date(Date.now() - w * 7 * 24 * 3_600_000)
    const inWeek    = credentials.filter((c) => c.createdAt >= weekStart && c.createdAt < weekEnd)
    weeklyData.push({
      week:     weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total:    inWeek.length,
      replaced: inWeek.filter((c) => c.assetStatus === 'REPLACED').length,
    })
  }

  // 6. KPIs globais
  const totalCreds    = credentials.length
  const totalReplaced = credentials.filter((c) => c.assetStatus === 'REPLACED').length
  const totalActive   = credentials.filter((c) => ['DELIVERED', 'WARMING'].includes(c.assetStatus)).length
  const globalReplacementPct = totalCreds > 0 ? Math.round((totalReplaced / totalCreds) * 100) : 0
  const alertCount    = ranking.filter((r) => r.alert).length

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    kpis: {
      totalCreds,
      totalReplaced,
      totalActive,
      globalReplacementPct,
      alertCount,
    },
    ranking,
    globalReasons,
    weeklyTimeline: weeklyData,
    alertThresholdPct: ALERT_THRESHOLD_PCT,
  })
}
