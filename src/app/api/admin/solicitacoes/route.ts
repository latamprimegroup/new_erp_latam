import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const where: { status?: string } = {}
  if (status) where.status = status

  const solicitations = await prisma.accountSolicitation.findMany({
    where,
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(solicitations)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, status } = updateSchema.parse(body)

    const solicitation = await prisma.accountSolicitation.update({
      where: { id },
      data: status ? { status } : {},
    })

    return NextResponse.json(solicitation)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
