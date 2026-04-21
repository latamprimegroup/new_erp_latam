import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PRODUCTION_MANAGER']

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const check = await prisma.inventoryCheck.findUnique({ where: { id: params.id } })
  if (!check) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (check.status !== 'ABERTO')
    return NextResponse.json({ error: 'Somente inventários abertos podem ser cancelados' }, { status: 409 })
  if (session.user.role === 'PRODUCTION_MANAGER' && check.managerId !== session.user.id)
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  await prisma.inventoryCheck.update({
    where: { id: params.id },
    data: { status: 'CANCELADO' },
  })

  return NextResponse.json({ success: true })
}
