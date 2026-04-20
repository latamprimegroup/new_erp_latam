import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Visão do cliente: grupos de entrega Plug & Play (somente leitura).
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true, clientCode: true },
  })
  if (!client) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  const groups = await prisma.deliveryGroup.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      groupNumber: true,
      quantityContracted: true,
      quantityDelivered: true,
      status: true,
      operationalBottleneck: true,
      observacoesProducao: true,
      expectedCompletionAt: true,
      groupCreatedAt: true,
      order: { select: { id: true, quantity: true, product: true } },
    },
  })

  const openRma = await prisma.accountReplacementRequest.count({
    where: {
      clientId: client.id,
      status: { in: ['EM_ANALISE', 'EM_REPOSICAO'] },
    },
  })

  const items = groups.map((g) => ({
    ...g,
    quantityPending: Math.max(0, g.quantityContracted - g.quantityDelivered),
    progressPercent:
      g.quantityContracted > 0
        ? Math.round((g.quantityDelivered / g.quantityContracted) * 100)
        : 0,
    clientLabel: client.clientCode ? `Cliente ${client.clientCode}` : 'Sua conta',
  }))

  return NextResponse.json({
    groups: items,
    clientCode: client.clientCode,
    openRmaCount: openRma,
  })
}
