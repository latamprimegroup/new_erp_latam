import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { ContestationStatus, Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalculateCustomerScore } from '@/lib/reputation-engine'

const VALID_STATUSES: ContestationStatus[] = Object.values(ContestationStatus)

/** Filtros compostos para alinhar ao wireframe (dropdown). */
const GROUP_FILTERS: Record<string, ContestationStatus[]> = {
  PENDENTES: ['OPEN', 'IN_REVIEW'],
  RESOLVIDOS: ['RESOLVED', 'REPLACEMENT_APPROVED'],
}

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

  const where: Prisma.ContestationTicketWhereInput = {}
  if (statusParam && GROUP_FILTERS[statusParam]) {
    where.status = { in: GROUP_FILTERS[statusParam] }
  } else if (statusParam && VALID_STATUSES.includes(statusParam as ContestationStatus)) {
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
          manager: {
            include: { user: { select: { name: true, email: true } } },
          },
          supplier: { select: { id: true, name: true, contact: true } },
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

    if (ticket.clientId) {
      void recalculateCustomerScore(ticket.clientId).catch(console.error)
    }

    return NextResponse.json(ticket)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao atualizar ticket' }, { status: 500 })
  }
}
