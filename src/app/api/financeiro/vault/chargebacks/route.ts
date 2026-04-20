import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { registerChargebackAndFlagAssets } from '@/lib/vault-chargeback'
import { audit } from '@/lib/audit'

const ROLES = ['ADMIN', 'FINANCE'] as const

const postSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  gatewayRef: z.string().optional(),
  notes: z.string().optional(),
  extraStockAccountIds: z.array(z.string()).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const rows = await prisma.chargebackRecord.findMany({
    take: 80,
    orderBy: { createdAt: 'desc' },
    include: {
      order: { select: { id: true, value: true, status: true, clientId: true } },
    },
  })

  return NextResponse.json({
    chargebacks: rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      amount: r.amount.toString(),
      status: r.status,
      gatewayRef: r.gatewayRef,
      notes: r.notes,
      affectedStockAccountIds: r.affectedStockAccountIds,
      createdAt: r.createdAt.toISOString(),
      order: r.order,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = postSchema.parse(await req.json())
    const cb = await registerChargebackAndFlagAssets({
      orderId: body.orderId,
      amount: body.amount,
      gatewayRef: body.gatewayRef,
      notes: body.notes,
      extraStockAccountIds: body.extraStockAccountIds,
      createdById: session.user.id,
    })
    await audit({
      userId: session.user.id,
      action: 'vault_chargeback_registered',
      entity: 'ChargebackRecord',
      entityId: cb.id,
      details: { orderId: body.orderId, amount: body.amount },
    })
    return NextResponse.json({ id: cb.id, ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Payload inválido' }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
