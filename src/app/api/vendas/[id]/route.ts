import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const patchSchema = z.object({
  deliveryMethod: z.enum(['ADSPOWER_SHARE', 'SPREADSHEET', 'ERP_DIRECT']).optional().nullable(),
  unitValue: z.number().min(0).optional().nullable(),
  fxRateBrlToUsd: z.number().min(0).optional().nullable(),
  paymentMethod: z
    .enum(['BANK_TRANSFER', 'STRIPE', 'CRYPTO', 'LEAD_BANK', 'PIX', 'OUTRO'])
    .optional()
    .nullable(),
  paymentReferenceMemo: z.string().max(120).optional().nullable(),
  documentationUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  saleUseNiche: z.string().max(48).optional().nullable(),
  warrantyHours: z.number().int().min(1).max(8760).optional(),
  currency: z.enum(['BRL', 'USD']).optional(),
  deliveredAssetIdsJson: z.array(z.string().max(200)).max(200).optional().nullable(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  try {
    const body = patchSchema.parse(await req.json())
    const order = await prisma.order.findUnique({ where: { id } })
    if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (body.deliveryMethod !== undefined) data.deliveryMethod = body.deliveryMethod
    if (body.unitValue !== undefined) data.unitValue = body.unitValue
    if (body.fxRateBrlToUsd !== undefined) data.fxRateBrlToUsd = body.fxRateBrlToUsd
    if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod
    if (body.paymentReferenceMemo !== undefined) data.paymentReferenceMemo = body.paymentReferenceMemo
    if (body.documentationUrl !== undefined) {
      data.documentationUrl = body.documentationUrl === '' ? null : body.documentationUrl
    }
    if (body.saleUseNiche !== undefined) data.saleUseNiche = body.saleUseNiche
    if (body.warrantyHours !== undefined) data.warrantyHours = body.warrantyHours
    if (body.currency !== undefined) data.currency = body.currency
    if (body.deliveredAssetIdsJson !== undefined) {
      data.deliveredAssetIdsJson = body.deliveredAssetIdsJson
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const updated = await prisma.order.update({
      where: { id },
      data: data as never,
      include: {
        client: { include: { user: { select: { name: true, email: true } } } },
        seller: { select: { name: true } },
      },
    })

    await audit({
      userId: session.user.id,
      action: 'order_war_room_fields_updated',
      entity: 'Order',
      entityId: id,
      details: { fields: Object.keys(data) },
    })

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
