import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { canManageCommercialTeam } from '@/lib/commercial-hierarchy'

const createSchema = z.object({
  code: z.string().min(2).max(40),
  percentOff: z.number().int().min(1).max(90),
  minQuantity: z.number().int().min(1).default(1),
  description: z.string().max(200).optional(),
  active: z.boolean().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const coupons = await prisma.commercialCoupon.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ coupons })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = createSchema.parse(await req.json())
    if (
      session.user.role === 'COMMERCIAL' &&
      !canManageCommercialTeam(session.user.role, session.user.cargo) &&
      body.percentOff > 0
    ) {
      const maxDiscountSetting = await prisma.systemSetting.findUnique({
        where: { key: 'commercial_manager_max_discount_pct' },
        select: { value: true },
      })
      const maxDiscountPct = Number.parseFloat(maxDiscountSetting?.value ?? '15')
      if (body.percentOff > maxDiscountPct) {
        return NextResponse.json(
          { error: `Desconto acima do limite autorizado (${maxDiscountPct}%). Solicite aprovação do gerente.` },
          { status: 403 }
        )
      }
    }

    const code = body.code.trim().toUpperCase()
    const row = await prisma.commercialCoupon.create({
      data: {
        code,
        percentOff: body.percentOff,
        minQuantity: body.minQuantity,
        description: body.description?.trim() || null,
        active: body.active !== false,
      },
    })
    await audit({
      userId: session.user?.id,
      action: 'commercial_coupon_created',
      entity: 'CommercialCoupon',
      entityId: row.id,
      details: { code, percentOff: body.percentOff, minQuantity: body.minQuantity },
    })
    return NextResponse.json(row)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
