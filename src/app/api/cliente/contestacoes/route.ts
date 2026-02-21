import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(['BAN_CONTESTATION', 'REPLACEMENT_REQUEST', 'PAUSED_NEEDS_OPS']),
  banReason: z.string().optional(),
  description: z.string().min(10),
  needsReplacement: z.boolean().default(false),
  commercialOpsRequested: z.boolean().default(false),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const tickets = await prisma.contestationTicket.findMany({
    where: { clientId: client.id },
    include: {
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const account = await prisma.stockAccount.findFirst({
      where: { id: data.accountId, clientId: client.id },
    })
    if (!account) {
      return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
    }

    const ticket = await prisma.contestationTicket.create({
      data: {
        clientId: client.id,
        accountId: data.accountId,
        type: data.type,
        banReason: data.banReason,
        description: data.description,
        needsReplacement: data.needsReplacement,
        commercialOpsRequested: data.commercialOpsRequested,
      },
      include: {
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
    })

    return NextResponse.json(ticket)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao criar ticket' }, { status: 500 })
  }
}
