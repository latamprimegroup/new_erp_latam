import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  stockAccountId: z.string().min(1),
  webhookEventId: z.string().min(1),
  provider: z.string().min(1).max(32),
})

/** Liga ativo de estoque a evento de venda (base para “conversões sintéticas” / Nutra). */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = bodySchema.parse(await req.json())
    const [acc, ev] = await Promise.all([
      prisma.stockAccount.findUnique({ where: { id: body.stockAccountId }, select: { id: true } }),
      prisma.affiliateWebhookEvent.findUnique({ where: { id: body.webhookEventId }, select: { id: true } }),
    ])
    if (!acc) return NextResponse.json({ error: 'StockAccount não encontrada' }, { status: 404 })
    if (!ev) return NextResponse.json({ error: 'Webhook event não encontrado' }, { status: 404 })

    const intent = await prisma.syntheticConversionIntent.create({
      data: {
        stockAccountId: body.stockAccountId,
        webhookEventId: body.webhookEventId,
        provider: body.provider,
        status: 'PENDING',
      },
    })
    return NextResponse.json(intent)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
