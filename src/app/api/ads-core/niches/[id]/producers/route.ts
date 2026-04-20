import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

/** Lista produtores habilitados para o nicho (vazio = qualquer produtor pode receber ativos deste nicho). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: nicheId } = await params
  const niche = await prisma.adsCoreNiche.findFirst({
    where: { id: nicheId, active: true },
    select: { id: true, name: true },
  })
  if (!niche) return NextResponse.json({ error: 'Nicho não encontrado' }, { status: 404 })

  const rows = await prisma.adsCoreProducerNiche.findMany({
    where: { nicheId },
    select: { producerId: true },
  })
  const producerIds = rows.map((r) => r.producerId)

  const producers =
    producerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: producerIds }, role: 'PRODUCER' },
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' },
        })
      : []

  return NextResponse.json({
    niche,
    producerIds,
    producers,
    restricted: producerIds.length > 0,
  })
}

const putSchema = z.object({
  producerIds: z.array(z.string().min(1)).max(500),
})

/** Substitui a lista de produtores habilitados para o nicho. Array vazio remove restrição. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id: nicheId } = await params
  const niche = await prisma.adsCoreNiche.findFirst({
    where: { id: nicheId, active: true },
    select: { id: true, name: true },
  })
  if (!niche) return NextResponse.json({ error: 'Nicho não encontrado' }, { status: 404 })

  let body: z.infer<typeof putSchema>
  try {
    body = putSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Body inválido: { producerIds: string[] }' }, { status: 400 })
  }

  const uniqueIds = [...new Set(body.producerIds)]
  if (uniqueIds.length > 0) {
    const valid = await prisma.user.findMany({
      where: { id: { in: uniqueIds }, role: 'PRODUCER' },
      select: { id: true },
    })
    const ok = new Set(valid.map((u) => u.id))
    const bad = uniqueIds.filter((id) => !ok.has(id))
    if (bad.length) {
      return NextResponse.json(
        { error: 'IDs que não são produtores válidos', invalidIds: bad },
        { status: 400 }
      )
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.adsCoreProducerNiche.deleteMany({ where: { nicheId } })
    if (uniqueIds.length > 0) {
      await tx.adsCoreProducerNiche.createMany({
        data: uniqueIds.map((producerId) => ({ nicheId, producerId })),
      })
    }
  })

  await audit({
    userId: auth.session.user.id,
    action: 'ads_core_niche_producers_updated',
    entity: 'AdsCoreNiche',
    entityId: nicheId,
    details: {
      nicheName: niche.name,
      count: uniqueIds.length,
      restricted: uniqueIds.length > 0,
    },
  })

  return NextResponse.json({ ok: true, producerIds: uniqueIds, restricted: uniqueIds.length > 0 })
}
