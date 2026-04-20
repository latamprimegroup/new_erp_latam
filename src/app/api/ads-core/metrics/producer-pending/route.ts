import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

/**
 * Contagem de carga: demandas na esteira (tudo que não está aprovado/rejeitado) por produtor.
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const grouped = await prisma.adsCoreAsset.groupBy({
    by: ['producerId'],
    where: {
      producerId: { not: null },
      statusProducao: { notIn: ['APROVADO', 'REPROVADO'] },
    },
    _count: { _all: true },
  })

  const producers = await prisma.user.findMany({
    where: { role: 'PRODUCER' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  const countBy = new Map<string, number>()
  for (const g of grouped) {
    if (g.producerId) countBy.set(g.producerId, g._count._all)
  }

  const items = producers.map((p) => ({
    producerId: p.id,
    name: p.name,
    email: p.email,
    pendingCount: countBy.get(p.id) ?? 0,
  }))

  return NextResponse.json({ items })
}
