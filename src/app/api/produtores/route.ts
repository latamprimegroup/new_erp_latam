import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = session.user.role
  if (role === 'ADMIN') {
    const producers = await prisma.user.findMany({
      where: { role: 'PRODUCER' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(producers)
  }

  if (role === 'PRODUCER') {
    const self = await prisma.user.findFirst({
      where: { id: session.user.id, role: 'PRODUCER' },
      select: { id: true, name: true, email: true },
    })
    return NextResponse.json(self ? [self] : [])
  }

  return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
}
