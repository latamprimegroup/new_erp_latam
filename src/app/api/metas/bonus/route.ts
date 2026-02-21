import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  goalId: z.string().min(1),
  value: z.number().positive(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { goalId, value } = schema.parse(body)

    const release = await prisma.bonusRelease.create({
      data: {
        goalId,
        value,
        status: 'released',
        releasedAt: new Date(),
      },
      include: { goal: { include: { user: { select: { name: true } } } } },
    })

    await prisma.goal.update({
      where: { id: goalId },
      data: { bonus: { increment: value } },
    })

    return NextResponse.json(release)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao liberar bônus' }, { status: 500 })
  }
}
