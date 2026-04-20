import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function withAdsCoreOpenCounts<T extends { id: string }>(users: T[]) {
  if (users.length === 0) return users as (T & { adsCoreOpenCount: number })[]
  const grouped = await prisma.adsCoreAsset.groupBy({
    by: ['producerId'],
    where: {
      producerId: { not: null, in: users.map((u) => u.id) },
      statusProducao: { notIn: ['APROVADO', 'REPROVADO'] },
    },
    _count: { _all: true },
  })
  const m = new Map(grouped.map((g) => [g.producerId!, g._count._all]))
  return users.map((u) => ({ ...u, adsCoreOpenCount: m.get(u.id) ?? 0 }))
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'FINANCE', 'PRODUCTION_MANAGER'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const adsCoreNicheId = searchParams.get('adsCoreNicheId')?.trim() || ''

  const baseWhere = { role: 'PRODUCER' as const }

  if (adsCoreNicheId) {
    const linked = await prisma.adsCoreProducerNiche.findMany({
      where: { nicheId: adsCoreNicheId },
      select: { producerId: true },
    })
    if (linked.length > 0) {
      const ids = linked.map((l) => l.producerId)
      const users = await prisma.user.findMany({
        where: { ...baseWhere, id: { in: ids } },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      })
      const enriched = await withAdsCoreOpenCounts(users)
      return NextResponse.json({
        users: enriched,
        adsCoreNicheFiltered: true,
        message:
          'Lista restrita aos colaboradores habilitados para este nicho (ADS CORE — Gestão por nicho).',
      })
    }
  }

  const users = await prisma.user.findMany({
    where: baseWhere,
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })
  const enriched = await withAdsCoreOpenCounts(users)

  return NextResponse.json({
    users: enriched,
    adsCoreNicheFiltered: false,
    message:
      adsCoreNicheId && !users.length
        ? undefined
        : adsCoreNicheId
          ? 'Nenhuma restrição cadastrada para este nicho — todos os produtores podem ser atribuídos.'
          : undefined,
  })
}
