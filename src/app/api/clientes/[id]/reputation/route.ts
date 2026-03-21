import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'COMMERCIAL', 'DELIVERER', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const client = await prisma.clientProfile.findUnique({
    where: { id },
    select: {
      id: true,
      reputationScore: true,
      averageAccountLifetimeDays: true,
      refundCount: true,
      nicheTag: true,
      plugPlayErrorCount: true,
      totalAccountsBought: true,
      totalSpent: true,
      user: { select: { name: true, email: true } },
    },
  })

  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  return NextResponse.json(client)
}

const updateSchema = z.object({
  reputationScore: z.number().min(0).max(100).optional(),
  averageAccountLifetimeDays: z.number().min(0).optional(),
  refundCount: z.number().min(0).optional(),
  nicheTag: z.enum(['WHITE', 'BLACK', 'NUTRA', 'CASINO']).optional().nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas admin pode alterar reputação' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const client = await prisma.clientProfile.update({
    where: { id },
    data: {
      ...(parsed.data.reputationScore != null && { reputationScore: parsed.data.reputationScore }),
      ...(parsed.data.averageAccountLifetimeDays != null && { averageAccountLifetimeDays: parsed.data.averageAccountLifetimeDays }),
      ...(parsed.data.refundCount != null && { refundCount: parsed.data.refundCount }),
      ...(parsed.data.nicheTag !== undefined && { nicheTag: parsed.data.nicheTag }),
    },
    select: {
      id: true,
      reputationScore: true,
      averageAccountLifetimeDays: true,
      refundCount: true,
      nicheTag: true,
      plugPlayErrorCount: true,
    },
  })

  return NextResponse.json(client)
}
