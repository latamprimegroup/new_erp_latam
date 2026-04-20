import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

/** Status "em aberto" = ainda não finalizou G2 (não aprovado nem reprovado). */
const OPEN_STATUSES = ['DISPONIVEL', 'EM_PRODUCAO', 'VERIFICACAO_G2'] as const

/**
 * Ranking Anti-Idle: produtores com MENOR fila de ativos em aberto primeiro
 * (sugestão de distribuição para o gerente).
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const producers = await prisma.user.findMany({
    where: { role: 'PRODUCER' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  const grouped = await prisma.adsCoreAsset.groupBy({
    by: ['producerId'],
    where: {
      producerId: { not: null },
      statusProducao: { in: [...OPEN_STATUSES] },
    },
    _count: { _all: true },
  })

  const openByProducer = new Map<string, number>()
  for (const g of grouped) {
    if (g.producerId) openByProducer.set(g.producerId, g._count._all)
  }

  const ranking = producers
    .map((p) => ({
      producerId: p.id,
      name: p.name,
      email: p.email,
      openCount: openByProducer.get(p.id) ?? 0,
    }))
    .sort((a, b) => a.openCount - b.openCount || (a.name || a.email).localeCompare(b.name || b.email))

  return NextResponse.json({
    ranking,
    hint: 'Priorize atribuir novos lotes aos primeiros da lista (menor fila em aberto).',
  })
}
