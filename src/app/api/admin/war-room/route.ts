/**
 * GET — Agregações server-side para o dashboard War Room (ADS CORE OS).
 * Query: days=30, platform=GOOGLE_ADS|META_ADS|TIKTOK_ADS|KWAI_ADS|ALL, niche=string, collaboratorId=cuid
 */
import { NextRequest, NextResponse } from 'next/server'
import type { AccountPlatform, Prisma } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const MARKETING_KEY = 'marketing_emergency_pause'
const KILL_KEY = 'global_kill_switch'

function parsePlatform(p: string | null): AccountPlatform | undefined {
  if (!p || p === 'ALL') return undefined
  const u = p.toUpperCase().replace(/-/g, '_')
  const map: Record<string, AccountPlatform> = {
    GOOGLE: 'GOOGLE_ADS',
    GOOGLE_ADS: 'GOOGLE_ADS',
    META: 'META_ADS',
    META_ADS: 'META_ADS',
    TIKTOK: 'TIKTOK_ADS',
    TIKTOK_ADS: 'TIKTOK_ADS',
    KWAI: 'KWAI_ADS',
    KWAI_ADS: 'KWAI_ADS',
  }
  return map[u] ?? (['GOOGLE_ADS', 'META_ADS', 'TIKTOK_ADS', 'KWAI_ADS', 'OTHER'].includes(u) ? (u as AccountPlatform) : undefined)
}

function isContingencyCategory(category: string, costCenter: string | null): boolean {
  const c = `${category} ${costCenter ?? ''}`.toLowerCase()
  return /proxy|proxies|servidor|vps|dom[ií]nio|cloaker|conting[eê]ncia|pixel|infra|hosting|cdn|tunnel|residential/.test(c)
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const sp = req.nextUrl.searchParams
  const days = Math.min(365, Math.max(7, parseInt(sp.get('days') || '30', 10) || 30))
  const platform = parsePlatform(sp.get('platform'))
  const nicheRaw = sp.get('niche')?.trim()
  const collaboratorId = sp.get('collaboratorId')?.trim() || undefined

  const now = new Date()
  const msDay = 24 * 60 * 60 * 1000
  const t24 = new Date(now.getTime() - msDay)
  const t7 = new Date(now.getTime() - 7 * msDay)
  const periodStart = new Date(now.getTime() - days * msDay)
  const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const stockBase: Prisma.StockAccountWhereInput = {
    deletedAt: null,
    ...(platform ? { platform } : {}),
  }

  const blackBase: Prisma.BlackOperationWhereInput = {
    ...(nicheRaw ? { niche: nicheRaw } : {}),
    ...(platform
      ? {
          stockAccount: { is: { platform } },
        }
      : {}),
  }

  const g2CreatorFilter: Prisma.ProductionG2WhereInput = collaboratorId ? { creatorId: collaboratorId } : {}

  const [
    settings,
    blackBanned24h,
    blackBanned7d,
    blackLive,
    blackHeatmap,
    stockAvailable,
    stockCritical,
    stockInUse,
    interPending,
    intentsAgg,
    financialRows,
    g2Rejected7d,
    g2ValidatedMonth,
    cancelledThis,
    cancelledPrev,
    wentLive30d,
  ] = await Promise.all([
    prisma.systemSetting.findMany({
      where: { key: { in: [MARKETING_KEY, KILL_KEY, 'estoque_minimo', 'producao_meta_mensal'] } },
    }),
    prisma.blackOperation.count({
      where: { ...blackBase, bannedAt: { gte: t24 } },
    }),
    prisma.blackOperation.count({
      where: { ...blackBase, bannedAt: { gte: t7 } },
    }),
    prisma.blackOperation.count({
      where: {
        ...blackBase,
        status: { in: ['LIVE', 'SURVIVED_24H', 'EM_CONFIG', 'EM_AQUECIMENTO'] },
      },
    }),
    prisma.blackOperation.groupBy({
      by: ['niche'],
      where: {
        ...blackBase,
        bannedAt: { gte: periodStart },
      },
      _count: { id: true },
    }),
    prisma.stockAccount.count({ where: { ...stockBase, status: 'AVAILABLE' } }),
    prisma.stockAccount.count({ where: { ...stockBase, status: 'CRITICAL' } }),
    prisma.stockAccount.count({
      where: { ...stockBase, status: { in: ['IN_USE', 'DELIVERED'] } },
    }),
    prisma.order.count({
      where: {
        interPixTxid: { not: null },
        status: { in: ['AWAITING_PAYMENT', 'PENDING'] },
      },
    }),
    prisma.syntheticConversionIntent.findMany({
      where: {
        createdAt: { gte: periodStart },
        ...(platform
          ? {
              stockAccount: { is: { platform } },
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        webhookEvent: { select: { roiValueBrl: true } },
      },
    }),
    prisma.financialEntry.findMany({
      where: { date: { gte: sixMonthsStart } },
      select: { date: true, type: true, value: true, category: true, costCenter: true },
    }),
    prisma.productionG2.count({
      where: {
        deletedAt: null,
        status: 'REPROVADA',
        rejectedAt: { gte: t7 },
        ...g2CreatorFilter,
        ...(platform || nicheRaw
          ? {
              stockAccount: {
                is: {
                  ...(platform ? { platform } : {}),
                  ...(nicheRaw ? { niche: nicheRaw } : {}),
                },
              },
            }
          : {}),
      },
    }),
    prisma.productionG2.findMany({
      where: {
        deletedAt: null,
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        ...g2CreatorFilter,
        ...(platform || nicheRaw
          ? {
              stockAccount: {
                is: {
                  ...(platform ? { platform } : {}),
                  ...(nicheRaw ? { niche: nicheRaw } : {}),
                },
              },
            }
          : {}),
      },
      select: { validatedAt: true, creatorId: true       },
    }),
    prisma.order.count({
      where: { status: 'CANCELLED', updatedAt: { gte: t7 } },
    }),
    prisma.order.count({
      where: { status: 'CANCELLED', updatedAt: { gte: new Date(now.getTime() - 14 * msDay), lt: t7 } },
    }),
    prisma.blackOperation.findMany({
      where: {
        ...blackBase,
        wentLiveAt: { gte: new Date(now.getTime() - 30 * msDay) },
      },
      select: { status: true },
    }),
  ])

  const settingMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const marketingEmergency = settingMap[MARKETING_KEY] === '1' || settingMap[MARKETING_KEY] === 'true'
  const globalKillSwitch = settingMap[KILL_KEY] === '1' || settingMap[KILL_KEY] === 'true'
  const estoqueMin = parseInt(settingMap['estoque_minimo'] ?? '50', 10) || 50
  const metaMensal = parseInt(settingMap['producao_meta_mensal'] ?? '330', 10) || 330
  const diasNoMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const metaDiaria = Math.ceil(metaMensal / diasNoMes)

  const survivedBlack30d = wentLive30d.filter((o) => o.status !== 'BANNED').length
  const survivalBlack30dRate =
    wentLive30d.length > 0 ? Math.round((100 * survivedBlack30d) / wentLive30d.length) : 100

  const totalBlackPulse = blackLive + blackBanned7d
  const survivalPulse7dPct =
    totalBlackPulse > 0 ? Math.round((100 * blackLive) / totalBlackPulse) : blackLive > 0 ? 100 : 100

  let linkedRoi = 0
  let linkedCount = 0
  for (const i of intentsAgg) {
    const v = i.webhookEvent?.roiValueBrl
    if (v != null) {
      linkedRoi += Number(v)
      linkedCount += 1
    }
  }

  const flowMap = new Map<string, { receita: number; despesa: number; contingencia: number }>()
  for (const e of financialRows) {
    const key = monthKey(e.date)
    const cur = flowMap.get(key) ?? { receita: 0, despesa: 0, contingencia: 0 }
    const val = Number(e.value)
    if (e.type === 'INCOME') cur.receita += val
    else {
      cur.despesa += val
      if (isContingencyCategory(e.category, e.costCenter)) cur.contingencia += val
    }
    flowMap.set(key, cur)
  }
  const financialFlow = [...flowMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      receitaBruta: Math.round(v.receita * 100) / 100,
      custoContingencia: Math.round(v.contingencia * 100) / 100,
      lucroLiquidoReal: Math.round((v.receita - v.despesa) * 100) / 100,
    }))

  const heatMax = Math.max(1, ...blackHeatmap.map((h) => h._count.id))
  const bansHeatmap = blackHeatmap
    .map((h) => ({
      niche: h.niche || '—',
      count: h._count.id,
      intensity: Math.round((100 * h._count.id) / heatMax) / 100,
    }))
    .sort((a, b) => b.count - a.count)

  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)
  const todayCounts = new Map<string, number>()
  for (const g of g2ValidatedMonth) {
    if (!g.validatedAt) continue
    if (g.validatedAt >= startToday) {
      todayCounts.set(g.creatorId, (todayCounts.get(g.creatorId) ?? 0) + 1)
    }
  }

  const creatorIds = [...new Set(g2ValidatedMonth.map((g) => g.creatorId))]
  const users = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true },
  })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  const productivityRank = [...todayCounts.entries()]
    .map(([id, delivered]) => ({
      userId: id,
      name: userMap[id] ?? id.slice(0, 8),
      delivered,
      metaDiaria,
      pct: Math.min(100, Math.round((delivered / Math.max(1, metaDiaria)) * 100)),
    }))
    .sort((a, b) => b.delivered - a.delivered)
    .slice(0, 15)

  const byCreator7d = await prisma.productionG2.groupBy({
    by: ['creatorId'],
    where: {
      deletedAt: null,
      validatedAt: { not: null, gte: t7 },
      ...g2CreatorFilter,
    },
    _count: { id: true },
  })
  const counts7d = byCreator7d.map((c) => c._count.id)
  const mean7 = counts7d.length ? counts7d.reduce((a, b) => a + b, 0) / counts7d.length : 0
  const var7 =
    counts7d.length > 1
      ? counts7d.reduce((s, c) => s + (c - mean7) ** 2, 0) / counts7d.length
      : 0
  const std7 = Math.sqrt(var7)

  const anomalies: { type: string; severity: 'alta' | 'media'; message: string }[] = []

  for (const row of byCreator7d) {
    const c = row._count.id
    if (mean7 > 2 && std7 > 0 && c > mean7 + 2 * std7 && c >= mean7 * 3) {
      anomalies.push({
        type: 'produtividade',
        severity: 'alta',
        message: `${userMap[row.creatorId] ?? row.creatorId}: ${c} contas validadas em 7d vs média ${mean7.toFixed(1)} (≥ desvio).`,
      })
    }
  }
  if (cancelledPrev > 0 && cancelledThis > cancelledPrev * 2 && cancelledThis >= 3) {
    anomalies.push({
      type: 'reembolsos_pedidos',
      severity: 'media',
      message: `Pedidos cancelados subiram: ${cancelledThis} (7d) vs ${cancelledPrev} (7d anterior).`,
    })
  }
  if (blackBanned24h >= 3) {
    anomalies.push({
      type: 'black_ban_spike',
      severity: 'alta',
      message: `${blackBanned24h} operações black marcadas com ban nas últimas 24h.`,
    })
  }
  if (stockAvailable < estoqueMin) {
    anomalies.push({
      type: 'estoque',
      severity: 'media',
      message: `Estoque disponível (${stockAvailable}) abaixo do mínimo configurado (${estoqueMin}).`,
    })
  }

  return NextResponse.json({
    generatedAt: now.toISOString(),
    filters: {
      days,
      platform: platform ?? 'ALL',
      niche: nicheRaw ?? null,
      collaboratorId: collaboratorId ?? null,
    },
    switches: {
      marketingEmergency,
      globalKillSwitch,
    },
    survival: {
      blackLive,
      blackBanned24h,
      blackBanned7d,
      survivalPulse7dPct,
      blackWentLive30d: wentLive30d.length,
      survivalBlack30dRate,
      g2Rejected7d,
      stockInUse,
      stockAvailable,
      definitions:
        'Black: LIVE/SURVIVED/EM_CONFIG/AQUECIMENTO vs bans com data. G2: reprovações 7d. Estoque: disponível + em uso.',
    },
    syntheticHydra: {
      intentsPeriod: intentsAgg.length,
      intentsPending: intentsAgg.filter((i) => i.status === 'PENDING').length,
      linkedRoiSumBrl: Math.round(linkedRoi * 100) / 100,
      avgRoiPerLinkedIntent:
        linkedCount > 0 ? Math.round((linkedRoi / linkedCount) * 100) / 100 : null,
    },
    stockCritical: {
      minSetting: Number.isFinite(estoqueMin) ? estoqueMin : 50,
      available: stockAvailable,
      criticalStatusCount: stockCritical,
      belowMin: stockAvailable < (Number.isFinite(estoqueMin) ? estoqueMin : 50),
    },
    interPendingOrders: interPending,
    financialFlow,
    bansHeatmap,
    productivityRank,
    anomalies,
  })
}
