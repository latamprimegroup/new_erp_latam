import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCommercialManagerAccess } from '@/lib/commercial-hierarchy'

const schema = z.object({
  maxDiscountPct: z.number().min(0).max(90),
})

/**
 * PATCH /api/commercial/manager/descontos
 * Define teto de desconto autorizado para cupons do comercial.
 */
export async function PATCH(req: NextRequest) {
  const access = await requireCommercialManagerAccess()
  if (!access.ok) return access.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' }, { status: 422 })
  }

  const { maxDiscountPct } = parsed.data

  await prisma.systemSetting.upsert({
    where: { key: 'commercial_manager_max_discount_pct' },
    update: {
      value: String(maxDiscountPct),
      updatedAt: new Date(),
    },
    create: {
      key: 'commercial_manager_max_discount_pct',
      value: String(maxDiscountPct),
    },
  })

  await prisma.commercialDataAuditLog.create({
    data: {
      userId: access.session.user.id,
      role: access.session.user.role || 'COMMERCIAL',
      action: 'MANAGER_DISCOUNT_CAP_UPDATE',
      entityType: 'SystemSetting',
      entityId: 'commercial_manager_max_discount_pct',
      metadata: {
        maxDiscountPct,
      } as never,
    },
  }).catch((e) => console.error('[ManagerDiscountCap] audit error', e))

  return NextResponse.json({ ok: true, maxDiscountPct })
}

export async function GET() {
  const access = await requireCommercialManagerAccess()
  if (!access.ok) return access.response

  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'commercial_manager_max_discount_pct' },
    select: { value: true },
  })

  return NextResponse.json({
    maxDiscountPct: Number.parseFloat(setting?.value ?? '15'),
  })
}
