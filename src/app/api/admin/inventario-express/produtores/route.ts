import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'PRODUCTION_MANAGER']

/** Retorna lista de produtores (PRODUCER + PRODUCTION_MANAGER) para o dropdown do Inventário Express */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: {
      role: { in: ['PRODUCER', 'PRODUCTION_MANAGER', 'ADMIN'] },
      status: 'ACTIVE',
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    produtores: users.map((u) => ({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      role: u.role,
    })),
  })
}
