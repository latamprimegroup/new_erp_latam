/**
 * POST - Alugar número via 5sim e vincular à conta (StockAccount ou ProductionG2)
 * Uso: produção/estoque ao criar conta que precisa validação SMS do Google
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rentPhoneNumber } from '@/lib/sms'

const schema = z.object({
  stockAccountId: z.string().cuid().optional(),
  productionG2Id: z.string().cuid().optional(),
  country: z.string().min(2).optional(),
  operator: z.string().optional(),
  service: z.string().min(2).optional(),
}).refine((d) => d.stockAccountId || d.productionG2Id, {
  message: 'Informe stockAccountId ou productionG2Id',
})

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'PRODUCER', 'FINANCE'])
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const parsed = schema.parse(body)

    if (parsed.stockAccountId) {
      const acc = await prisma.stockAccount.findUnique({
        where: { id: parsed.stockAccountId },
      })
      if (!acc) {
        return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
      }
      const existing = await prisma.rentedPhoneNumber.findFirst({
        where: { stockAccountId: parsed.stockAccountId, status: 'ACTIVE' },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'Já existe número ativo para esta conta', rented: existing },
          { status: 400 }
        )
      }
    }

    if (parsed.productionG2Id) {
      const g2 = await prisma.productionG2.findUnique({
        where: { id: parsed.productionG2Id },
      })
      if (!g2) {
        return NextResponse.json({ error: 'Produção G2 não encontrada' }, { status: 404 })
      }
      const existing = await prisma.rentedPhoneNumber.findFirst({
        where: { productionG2Id: parsed.productionG2Id, status: 'ACTIVE' },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'Já existe número ativo para esta produção', rented: existing },
          { status: 400 }
        )
      }
    }

    const order = await rentPhoneNumber({
      country: parsed.country || process.env.FIVESIM_DEFAULT_COUNTRY || 'brazil',
      operator: parsed.operator || process.env.FIVESIM_DEFAULT_OPERATOR || undefined,
      service: parsed.service || 'google',
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Não foi possível alugar número. Verifique FIVESIM_API_KEY e saldo.' },
        { status: 503 }
      )
    }

    const rented = await prisma.rentedPhoneNumber.create({
      data: {
        stockAccountId: parsed.stockAccountId ?? undefined,
        productionG2Id: parsed.productionG2Id ?? undefined,
        phoneNumber: order.phoneNumber,
        country: order.country,
        operator: order.operator,
        service: order.service,
        provider: '5sim',
        providerOrderId: order.orderId,
        status: 'ACTIVE',
        expiresAt: order.expiresAt,
      },
    })

    if (parsed.stockAccountId) {
      await prisma.stockAccountCredential.upsert({
        where: { stockAccountId: parsed.stockAccountId },
        create: { stockAccountId: parsed.stockAccountId, twoFaSms: order.phoneNumber },
        update: { twoFaSms: order.phoneNumber },
      })
    }
    if (parsed.productionG2Id) {
      await prisma.productionG2Credential.upsert({
        where: { productionG2Id: parsed.productionG2Id },
        create: { productionG2Id: parsed.productionG2Id, twoFaSms: order.phoneNumber },
        update: { twoFaSms: order.phoneNumber },
      })
    }

    return NextResponse.json({
      id: rented.id,
      phoneNumber: rented.phoneNumber,
      providerOrderId: rented.providerOrderId,
      expiresAt: rented.expiresAt,
    })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    console.error('SMS rent error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao alugar número' },
      { status: 500 }
    )
  }
}
