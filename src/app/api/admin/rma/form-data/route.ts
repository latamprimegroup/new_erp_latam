import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/rma/form-data
 * Retorna clientes e (opcionalmente) as contas de um cliente específico
 * para preencher o formulário de novo ticket RMA.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')

  if (clientId) {
    // Retorna as contas entregues a esse cliente
    const accounts = await prisma.stockAccount.findMany({
      where: {
        clientId,
        deletedAt: null,
        status: { in: ['DELIVERED', 'IN_USE', 'DEAD'] },
      },
      select: {
        id: true,
        googleAdsCustomerId: true,
        platform: true,
        deliveredAt: true,
        status: true,
      },
      orderBy: { deliveredAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ accounts })
  }

  // Retorna lista de clientes
  const clients = await prisma.clientProfile.findMany({
    where: { clientStatus: { not: 'BLOQUEADO' } },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.user?.name ?? null,
      email: c.user?.email ?? null,
    })),
  })
}
