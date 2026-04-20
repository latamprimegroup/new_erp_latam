import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const querySchema = z.object({
  q: z.string().min(1).max(120),
})

/**
 * Busca contas entregues do cliente por ID (cuid) ou login Google / Customer ID.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({ q: searchParams.get('q') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Informe um termo de busca' }, { status: 400 })
  }
  const q = parsed.data.q.trim()

  const accounts = await prisma.stockAccount.findMany({
    where: {
      clientId: client.id,
      deletedAt: null,
      deliveredAt: { not: null },
      OR: [
        { id: q },
        { id: { contains: q } },
        { googleAdsCustomerId: { contains: q } },
        { credential: { email: { contains: q } } },
      ],
    },
    take: 15,
    orderBy: { deliveredAt: 'desc' },
    select: {
      id: true,
      platform: true,
      type: true,
      googleAdsCustomerId: true,
      status: true,
      deliveredAt: true,
      credential: { select: { email: true } },
    },
  })

  return NextResponse.json({ accounts })
}
