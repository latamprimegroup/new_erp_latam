import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const createdAt: Prisma.DateTimeFilter = {}
  if (from) {
    const d = new Date(from)
    d.setHours(0, 0, 0, 0)
    createdAt.gte = d
  }
  if (to) {
    const d = new Date(to)
    d.setHours(23, 59, 59, 999)
    createdAt.lte = d
  }

  const where: Prisma.OrderWhereInput = { clientId: client.id }
  if (Object.keys(createdAt).length > 0) where.createdAt = createdAt

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(orders)
}
