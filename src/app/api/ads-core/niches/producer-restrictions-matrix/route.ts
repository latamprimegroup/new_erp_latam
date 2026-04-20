import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

/**
 * Mapa nicheId → produtores habilitados na Gestão por nicho.
 * Nicho ausente do mapa = sem restrição (qualquer produtor).
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const rows = await prisma.adsCoreProducerNiche.findMany({
    select: { nicheId: true, producerId: true },
  })

  const byNiche = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!byNiche.has(r.nicheId)) byNiche.set(r.nicheId, new Set())
    byNiche.get(r.nicheId)!.add(r.producerId)
  }

  const byNicheId: Record<string, { restricted: boolean; producerIds: string[] }> = {}
  for (const [nicheId, set] of byNiche) {
    const producerIds = [...set]
    if (producerIds.length > 0) {
      byNicheId[nicheId] = { restricted: true, producerIds }
    }
  }

  return NextResponse.json({ byNicheId })
}
