import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notifications'

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'provisioning', 'completed', 'cancelled']).optional(),
  notes: z.string().optional(),
  expectedDeliveryAt: z.union([z.string().min(1), z.null()]).optional(),
})

const postSchema = z.object({
  action: z.literal('notify_managers_demand'),
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

  const [solicitations, demandAgg] = await Promise.all([
    prisma.accountSolicitation.findMany({
      where,
      include: {
        client: {
          include: {
            user: { select: { name: true, email: true } },
            metrics: {
              select: {
                ltvLiquido: true,
                ltvReal: true,
                segmento: true,
                scoreValor: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.accountSolicitation.groupBy({
      by: ['product', 'accountType'],
      where: { status: { in: ['pending', 'in_progress', 'provisioning'] } },
      _sum: { quantity: true },
    }),
  ])

  const demandByProduct = [...demandAgg]
    .map((r) => ({
      key: `${r.product} (${r.accountType})`,
      quantity: r._sum.quantity ?? 0,
    }))
    .filter((r) => r.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 12)

  const pendingCount = await prisma.accountSolicitation.count({
    where: { status: { in: ['pending', 'in_progress', 'provisioning'] } },
  })

  return NextResponse.json({
    items: solicitations,
    insights: {
      demandByProduct,
      pendingCount,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN' && session.user?.role !== 'COMMERCIAL') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    postSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  const agg = await prisma.accountSolicitation.groupBy({
    by: ['product', 'accountType'],
    where: { status: { in: ['pending', 'in_progress', 'provisioning'] } },
    _sum: { quantity: true },
  })

  if (agg.length === 0) {
    return NextResponse.json({ error: 'Não há demandas pendentes para comunicar' }, { status: 400 })
  }

  const top = [...agg]
    .map((r) => ({
      line: `• ${r.product} (${r.accountType}): ${r._sum.quantity ?? 0} un.`,
    }))
    .slice(0, 8)
    .map((x) => x.line)
    .join('\n')

  const message = `Demanda ativa no ERP (solicitações de clientes):\n${top}\n\nQuem tiver ativos compatíveis, pode lançar em Contas ofertadas / estoque.`

  const managers = await prisma.user.findMany({
    where: { role: 'MANAGER' },
    select: { id: true },
  })

  for (const m of managers) {
    await notifyUser(m.id, 'Demanda de novas contas', message, '/dashboard/gestor/lancar')
  }

  return NextResponse.json({ ok: true, notified: managers.length })
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
    const parsed = updateSchema.parse(body)

    const data: {
      status?: string
      notes?: string
      expectedDeliveryAt?: Date | null
    } = {}
    if (parsed.status !== undefined) data.status = parsed.status
    if (parsed.notes !== undefined) data.notes = parsed.notes
    if (parsed.expectedDeliveryAt !== undefined) {
      data.expectedDeliveryAt =
        parsed.expectedDeliveryAt === null
          ? null
          : new Date(parsed.expectedDeliveryAt)
    }

    const solicitation = await prisma.accountSolicitation.update({
      where: { id: parsed.id },
      data,
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
