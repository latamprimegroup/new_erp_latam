import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PRODUCTION_MANAGER']

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const check = await prisma.inventoryCheck.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: [{ abcClass: 'asc' }, { itemName: 'asc' }] },
      manager: { select: { id: true, name: true, email: true } },
    },
  })

  if (!check) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (session.user.role === 'PRODUCTION_MANAGER' && check.managerId !== session.user.id)
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  return NextResponse.json(check)
}
