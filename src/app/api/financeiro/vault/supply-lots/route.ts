import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const ROLES = ['ADMIN', 'FINANCE'] as const

const postSchema = z.object({
  label: z.string().min(1).max(200),
  category: z.enum(['DOMAIN', 'PROXY_RESIDENTIAL', 'PROXY_MOBILE', 'OTHER']),
  totalCost: z.number().positive(),
  unitsPurchased: z.number().int().positive(),
  expiresAt: z.string().optional().nullable(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const lots = await prisma.supplyLot.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({
    lots: lots.map((l) => ({
      ...l,
      totalCost: l.totalCost.toString(),
      unitCostComputed: l.unitCostComputed.toString(),
      expiresAt: l.expiresAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
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
    const total = new Prisma.Decimal(body.totalCost)
    const unit = total.div(body.unitsPurchased)
    let expiresAt: Date | null = null
    if (body.expiresAt?.trim()) {
      const d = new Date(body.expiresAt.trim())
      if (!Number.isNaN(d.getTime())) expiresAt = d
    }
    const lot = await prisma.supplyLot.create({
      data: {
        label: body.label,
        category: body.category,
        totalCost: total,
        unitsPurchased: body.unitsPurchased,
        unitsRemaining: body.unitsPurchased,
        unitCostComputed: unit,
        expiresAt,
      },
    })
    await audit({
      userId: session.user.id,
      action: 'vault_supply_lot_created',
      entity: 'SupplyLot',
      entityId: lot.id,
      details: { label: body.label, units: body.unitsPurchased },
    })
    return NextResponse.json({ id: lot.id })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Inválido' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Erro ao criar lote' }, { status: 500 })
  }
}
