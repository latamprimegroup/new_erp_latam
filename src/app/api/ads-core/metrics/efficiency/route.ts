import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

/**
 * BI: aprovações/reprovações por produtor e taxa de reprovação por nicho (célula).
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const byProducer = await prisma.adsCoreAsset.groupBy({
    by: ['producerId', 'statusProducao'],
    where: { producerId: { not: null } },
    _count: { _all: true },
  })

  const producers = await prisma.user.findMany({
    where: { role: 'PRODUCER' },
    select: { id: true, name: true, email: true },
  })
  const prodMap = new Map(producers.map((p) => [p.id, p]))

  type Agg = { approved: number; rejected: number; other: number }
  const prodAgg = new Map<string, Agg>()
  for (const row of byProducer) {
    if (!row.producerId) continue
    let a = prodAgg.get(row.producerId)
    if (!a) {
      a = { approved: 0, rejected: 0, other: 0 }
      prodAgg.set(row.producerId, a)
    }
    const n = row._count._all
    if (row.statusProducao === 'APROVADO') a.approved += n
    else if (row.statusProducao === 'REPROVADO') a.rejected += n
    else a.other += n
  }

  const producerRanking = producers
    .map((p) => {
      const a = prodAgg.get(p.id) || { approved: 0, rejected: 0, other: 0 }
      const decided = a.approved + a.rejected
      const rejectionRate = decided > 0 ? Math.round((a.rejected / decided) * 1000) / 10 : null
      return {
        producerId: p.id,
        name: p.name,
        email: p.email,
        approved: a.approved,
        rejected: a.rejected,
        inProgress: a.other,
        rejectionRatePct: rejectionRate,
      }
    })
    .sort((x, y) => y.approved - x.approved || (x.name || x.email).localeCompare(y.name || y.email))

  const byNiche = await prisma.adsCoreAsset.groupBy({
    by: ['nicheId', 'statusProducao'],
    _count: { _all: true },
  })

  const niches = await prisma.adsCoreNiche.findMany({ select: { id: true, name: true } })

  type NichePipeline = {
    emAberto: number
    emVerificacaoG2: number
    aprovadas: number
    reprovadas: number
  }
  const pipeline = new Map<string, NichePipeline>()
  for (const row of byNiche) {
    let b = pipeline.get(row.nicheId)
    if (!b) {
      b = { emAberto: 0, emVerificacaoG2: 0, aprovadas: 0, reprovadas: 0 }
      pipeline.set(row.nicheId, b)
    }
    const n = row._count._all
    const s = row.statusProducao
    if (s === 'DISPONIVEL' || s === 'EM_PRODUCAO') b.emAberto += n
    else if (s === 'VERIFICACAO_G2') b.emVerificacaoG2 += n
    else if (s === 'APROVADO') b.aprovadas += n
    else if (s === 'REPROVADO') b.reprovadas += n
  }

  const nicheStats = niches.map((n) => {
    const b = pipeline.get(n.id) ?? {
      emAberto: 0,
      emVerificacaoG2: 0,
      aprovadas: 0,
      reprovadas: 0,
    }
    const decided = b.aprovadas + b.reprovadas
    const rejectionRate = decided > 0 ? Math.round((b.reprovadas / decided) * 1000) / 10 : null
    return {
      nicheId: n.id,
      nicheName: n.name,
      approved: b.aprovadas,
      rejected: b.reprovadas,
      emAberto: b.emAberto,
      emVerificacaoG2: b.emVerificacaoG2,
      /** Total ainda em esteira (não aprovado nem reprovado). */
      inProgress: b.emAberto + b.emVerificacaoG2,
      rejectionRatePct: rejectionRate,
    }
  })

  return NextResponse.json({ producerRanking, nicheStats })
}
