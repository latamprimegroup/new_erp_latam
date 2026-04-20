import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

/**
 * GET - Lista alertas do agente (filtros: producerId, type, resolved)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  let producerId = searchParams.get('producerId')
  const type = searchParams.get('type')
  const resolved = searchParams.get('resolved')

  if (auth.session.user?.role === 'PRODUCER') {
    producerId = auth.session.user.id
  }

  const where: Record<string, unknown> = {}
  if (producerId) where.producerId = producerId
  if (type) where.type = type
  if (resolved === 'true') where.resolvedAt = { not: null }
  if (resolved === 'false') where.resolvedAt = null

  const alerts = await prisma.productionAlert.findMany({
    where,
    include: { producer: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ alerts })
}
