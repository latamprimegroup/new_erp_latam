import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function canAdsCoreAdmin(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

/**
 * Indicadores agregados: conversão por nicho, ranking de produtores, SLA médio (atribuição → G2).
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!canAdsCoreAdmin(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const niches = await prisma.adsCoreNiche.findMany({
    where: { active: true },
    select: { id: true, name: true },
  })
  const nicheName = new Map(niches.map((n) => [n.id, n.name]))

  const statusByNiche = await prisma.adsCoreAsset.groupBy({
    by: ['nicheId', 'statusProducao'],
    _count: { _all: true },
  })

  const conversionByNiche = new Map<
    string,
    { nicheId: string; nicheName: string; aprovados: number; reprovados: number; outros: number; taxaAprovacao: number | null }
  >()

  for (const row of statusByNiche) {
    const nid = row.nicheId
    if (!conversionByNiche.has(nid)) {
      conversionByNiche.set(nid, {
        nicheId: nid,
        nicheName: nicheName.get(nid) || nid,
        aprovados: 0,
        reprovados: 0,
        outros: 0,
        taxaAprovacao: null,
      })
    }
    const b = conversionByNiche.get(nid)!
    const c = row._count._all
    if (row.statusProducao === 'APROVADO') b.aprovados += c
    else if (row.statusProducao === 'REPROVADO') b.reprovados += c
    else b.outros += c
  }

  for (const b of conversionByNiche.values()) {
    const decided = b.aprovados + b.reprovados
    b.taxaAprovacao = decided > 0 ? Math.round((1000 * b.aprovados) / decided) / 10 : null
  }

  const approvedByProducer = await prisma.adsCoreAsset.groupBy({
    by: ['producerId'],
    where: { statusProducao: 'APROVADO', producerId: { not: null } },
    _count: { _all: true },
  })

  const producerIds = approvedByProducer.map((x) => x.producerId!).filter(Boolean)
  const users =
    producerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: producerIds } },
          select: { id: true, name: true, email: true },
        })
      : []
  const userLabel = new Map(users.map((u) => [u.id, (u.name || u.email || u.id).trim()]))

  const ranking = approvedByProducer
    .map((r) => ({
      producerId: r.producerId!,
      name: userLabel.get(r.producerId!) || r.producerId!,
      aprovados: r._count._all,
    }))
    .sort((a, b) => b.aprovados - a.aprovados)

  const slaRows = await prisma.adsCoreAsset.findMany({
    where: {
      producerAssignedAt: { not: null },
      g2FinalizedAt: { not: null },
    },
    select: {
      producerAssignedAt: true,
      g2FinalizedAt: true,
    },
    take: 8000,
    orderBy: { g2FinalizedAt: 'desc' },
  })

  const hours = slaRows.map(
    (r) =>
      (r.g2FinalizedAt!.getTime() - r.producerAssignedAt!.getTime()) / 3_600_000
  )
  const slaMediaHoras = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null
  const slaMediaDias = slaMediaHoras != null ? slaMediaHoras / 24 : null
  const amostraSla = hours.length

  return NextResponse.json({
    conversionByNiche: [...conversionByNiche.values()].sort((a, b) =>
      a.nicheName.localeCompare(b.nicheName)
    ),
    rankingProducers: ranking,
    sla: {
      mediaHoras: slaMediaHoras != null ? Math.round(slaMediaHoras * 100) / 100 : null,
      mediaDias: slaMediaDias != null ? Math.round(slaMediaDias * 100) / 100 : null,
      amostra: amostraSla,
      definicao: 'Tempo entre atribuição ao produtor (producerAssignedAt) e envio à G2 (g2FinalizedAt).',
    },
  })
}
