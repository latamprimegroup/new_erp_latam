import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const list = await prisma.stockAccount.findMany({
    where: { status: 'PENDING', managerId: { not: null } },
    include: { manager: { include: { user: { select: { name: true, email: true } } } }, supplier: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(list)
}
