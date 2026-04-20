import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_META_TAXA = 80
const DEFAULT_MIN_AMOSTRA = 10

type Row = {
  producerId: string
  status: string
  createdAt: Date
  rejectionReasonCode: string | null
}

function aggregate(rows: Row[]) {
  const total = rows.length
  const aprovadas = rows.filter((a) => a.status === 'APPROVED').length
  const reprovadas = rows.filter((a) => a.status === 'REJECTED').length
  const taxaSucesso = total > 0 ? Math.round((aprovadas / total) * 100) : 0

  const porMotivoMap = new Map<string, number>()
  for (const r of rows) {
    if (r.status !== 'REJECTED') continue
    const k = r.rejectionReasonCode?.trim() || 'Sem código'
    porMotivoMap.set(k, (porMotivoMap.get(k) ?? 0) + 1)
  }
  const porMotivo = Array.from(porMotivoMap.entries())
    .map(([motivo, quantidade]) => ({
      motivo,
      quantidade,
      percentualReprovados:
        reprovadas > 0 ? Math.round((quantidade / reprovadas) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)

  const dailyMap = new Map<string, { t: number; a: number; r: number }>()
  for (const r of rows) {
    const d = r.createdAt.toISOString().slice(0, 10)
    const cur = dailyMap.get(d) ?? { t: 0, a: 0, r: 0 }
    cur.t += 1
    if (r.status === 'APPROVED') cur.a += 1
    if (r.status === 'REJECTED') cur.r += 1
    dailyMap.set(d, cur)
  }
  const dailyQuality = Array.from(dailyMap.entries())
    .map(([data, x]) => ({
      data,
      total: x.t,
      aprovadas: x.a,
      reprovadas: x.r,
      taxaSucesso: x.t > 0 ? Math.round((x.a / x.t) * 100) : 0,
    }))
    .sort((a, b) => a.data.localeCompare(b.data))

  const byProdMap = new Map<string, { t: number; a: number; r: number }>()
  for (const r of rows) {
    const cur = byProdMap.get(r.producerId) ?? { t: 0, a: 0, r: 0 }
    cur.t += 1
    if (r.status === 'APPROVED') cur.a += 1
    if (r.status === 'REJECTED') cur.r += 1
    byProdMap.set(r.producerId, cur)
  }

  return {
    total,
    aprovadas,
    reprovadas,
    taxaSucesso,
    porMotivo,
    dailyQuality,
    byProdMap,
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = session.user.role
  const isOversight = role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
  const isProducer = role === 'PRODUCER'

  if (!isOversight && !isProducer) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const producerIdParam = searchParams.get('producerId')
  const period = searchParams.get('period') || 'month'
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  let scopedProducerId: string | null = null
  if (isProducer) {
    scopedProducerId = session.user.id
  } else if (isOversight && producerIdParam) {
    scopedProducerId = producerIdParam
  }

  const now = new Date()
  let start: Date
  let end = new Date(now)

  if (dateFrom && dateTo) {
    start = new Date(dateFrom)
    end = new Date(dateTo)
  } else {
    switch (period) {
      case 'day':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        start = new Date(now)
        start.setDate(start.getDate() - 7)
        break
      case 'year':
        start = new Date(now.getFullYear(), 0, 1)
        break
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1)
    }
  }

  const [settings, rows] = await Promise.all([
    prisma.systemSetting.findMany({
      where: {
        key: {
          in: ['producao_metrica_taxa_sucesso_min', 'producao_metrica_min_amostra'],
        },
      },
    }),
    prisma.productionAccount.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: start, lte: end },
        ...(scopedProducerId ? { producerId: scopedProducerId } : {}),
      },
      select: {
        producerId: true,
        status: true,
        createdAt: true,
        rejectionReasonCode: true,
      },
    }),
  ])

  const sm = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const taxaMinima = parseInt(
    sm.producao_metrica_taxa_sucesso_min || String(DEFAULT_META_TAXA),
    10
  )
  const minAmostra = parseInt(
    sm.producao_metrica_min_amostra || String(DEFAULT_MIN_AMOSTRA),
    10
  )

  const agg = aggregate(rows as Row[])

  const byProducer: Array<{
    producerId: string
    name: string | null
    total: number
    aprovadas: number
    reprovadas: number
    taxaSucesso: number
    abaixoDaMeta: boolean
  }> = []

  if (isOversight && !scopedProducerId && agg.byProdMap.size > 0) {
    const ids = Array.from(agg.byProdMap.keys())
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    })
    const names = Object.fromEntries(users.map((u) => [u.id, u.name]))
    for (const [pid, x] of agg.byProdMap) {
      const tx = x.t > 0 ? Math.round((x.a / x.t) * 100) : 0
      byProducer.push({
        producerId: pid,
        name: names[pid] ?? null,
        total: x.t,
        aprovadas: x.a,
        reprovadas: x.r,
        taxaSucesso: tx,
        abaixoDaMeta: x.t >= minAmostra && tx < taxaMinima,
      })
    }
    byProducer.sort((a, b) => b.total - a.total)
  }

  const alertaBaixaTaxa =
    agg.total >= minAmostra && agg.taxaSucesso < taxaMinima

  const produtoresAbaixoDaMeta = byProducer.filter((p) => p.abaixoDaMeta)

  const durMs = end.getTime() - start.getTime()
  let comparativoAnterior: {
    periodo: { start: string; end: string }
    label: string
    total: number
    aprovadas: number
    reprovadas: number
    taxaSucesso: number
  } | null = null

  let tempoMedioHorasPorAprovada: number | null = null
  let amostraTempoAprovadas = 0

  const timingPromise = prisma.productionAccount.findMany({
    where: {
      deletedAt: null,
      status: 'APPROVED',
      validatedAt: { not: null },
      createdAt: { gte: start, lte: end },
      ...(scopedProducerId ? { producerId: scopedProducerId } : {}),
    },
    select: { createdAt: true, validatedAt: true },
  })

  if (durMs > 0) {
    const endPrev = new Date(start.getTime() - 1)
    const startPrev = new Date(endPrev.getTime() - durMs)
    const periodLabels: Record<string, string> = {
      day: 'vs. período anterior equivalente',
      week: 'vs. período anterior equivalente',
      month: 'vs. período anterior equivalente',
      year: 'vs. período anterior equivalente',
    }
    const [prevRows, timingRows] = await Promise.all([
      prisma.productionAccount.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: startPrev, lte: endPrev },
          ...(scopedProducerId ? { producerId: scopedProducerId } : {}),
        },
        select: {
          producerId: true,
          status: true,
          createdAt: true,
          rejectionReasonCode: true,
        },
      }),
      timingPromise,
    ])
    const prevAgg = aggregate(prevRows as Row[])
    comparativoAnterior = {
      periodo: { start: startPrev.toISOString(), end: endPrev.toISOString() },
      label:
        dateFrom && dateTo ? 'vs. janela anterior (mesma duração)' : periodLabels[period] || 'vs. período anterior',
      total: prevAgg.total,
      aprovadas: prevAgg.aprovadas,
      reprovadas: prevAgg.reprovadas,
      taxaSucesso: prevAgg.taxaSucesso,
    }
    if (timingRows.length > 0) {
      let sumH = 0
      for (const r of timingRows) {
        if (!r.validatedAt) continue
        sumH += (r.validatedAt.getTime() - r.createdAt.getTime()) / 3_600_000
      }
      amostraTempoAprovadas = timingRows.length
      tempoMedioHorasPorAprovada = Math.round((sumH / timingRows.length) * 10) / 10
    }
  } else {
    const timingRows = await timingPromise
    if (timingRows.length > 0) {
      let sumH = 0
      for (const r of timingRows) {
        if (!r.validatedAt) continue
        sumH += (r.validatedAt.getTime() - r.createdAt.getTime()) / 3_600_000
      }
      amostraTempoAprovadas = timingRows.length
      tempoMedioHorasPorAprovada = Math.round((sumH / timingRows.length) * 10) / 10
    }
  }

  return NextResponse.json({
    periodo: { start: start.toISOString(), end: end.toISOString() },
    escopo: scopedProducerId ? 'produtor' : isOversight ? 'global' : 'produtor',
    total: agg.total,
    aprovadas: agg.aprovadas,
    reprovadas: agg.reprovadas,
    taxaSucesso: agg.taxaSucesso,
    porMotivo: agg.porMotivo,
    dailyQuality: agg.dailyQuality,
    byProducer,
    meta: {
      taxaMinima,
      minAmostra,
    },
    alertaBaixaTaxa,
    produtoresAbaixoDaMeta,
    comparativoAnterior,
    tempoMedioHorasPorAprovada,
    amostraTempoAprovadas,
  })
}
