import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { ContestationStatus } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_STATUSES: ContestationStatus[] = Object.values(ContestationStatus)

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['OPEN', 'IN_REVIEW', 'REPLACEMENT_APPROVED', 'RESOLVED', 'REJECTED']).optional(),
  accountReturned: z.boolean().optional(),
  resolutionNotes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const roles = ['ADMIN', 'COMMERCIAL']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')

  const where: { status?: ContestationStatus } = {}
  if (statusParam && VALID_STATUSES.includes(statusParam as ContestationStatus)) {
    where.status = statusParam as ContestationStatus
  }

  const tickets = await prisma.contestationTicket.findMany({
    where,
    include: {
      client: { include: { user: { select: { name: true, email: true } } } },
      account: {
        select: {
          id: true,
          platform: true,
          type: true,
          googleAdsCustomerId: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(tickets)
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
    const { id, status, accountReturned, resolutionNotes } = updateSchema.parse(body)

    const data: Record<string, unknown> = {}
    if (status !== undefined) data.status = status
    if (accountReturned !== undefined) data.accountReturned = accountReturned
    if (resolutionNotes !== undefined) data.resolutionNotes = resolutionNotes
    if (status === 'RESOLVED' || status === 'REJECTED') {
      data.resolvedAt = new Date()
      data.resolvedById = session.user.id
    }

    const ticket = await prisma.contestationTicket.update({
      where: { id },
      data,
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        account: { select: { id: true, platform: true, type: true, status: true } },
      },
    })

    return NextResponse.json(ticket)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar ticket' }, { status: 500 })
  }
}
