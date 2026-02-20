import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Lista colaboradores Plug & Play (usuários com role PLUG_PLAY)
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: { role: 'PLUG_PLAY' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ users })
}
