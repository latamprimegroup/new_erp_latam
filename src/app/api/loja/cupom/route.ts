/**
 * POST /api/loja/cupom
 *
 * Valida um cupom de desconto para um listing específico.
 * Retorna o valor do desconto calculado para o total informado.
 * Público — chamado pelo checkout da loja antes de gerar PIX.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  code:      z.string().min(1).max(40),
  listingId: z.string().min(1),
  qty:       z.number().int().min(1),
  unitPrice: z.number().positive(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 422 })
  }

  const { code, listingId, qty, unitPrice } = parsed.data
  const normalizedCode = code.trim().toUpperCase()
  const subtotal       = unitPrice * qty

  const coupon = await prisma.commercialCoupon.findUnique({
    where: { code: normalizedCode },
  })

  if (!coupon || !coupon.active) {
    return NextResponse.json({ valid: false, error: 'Cupom inválido ou inativo.' }, { status: 404 })
  }

  // Verifica expiração
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, error: 'Cupom expirado.' }, { status: 422 })
  }

  // Verifica limite de usos
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    return NextResponse.json({ valid: false, error: 'Cupom esgotado. Limite de usos atingido.' }, { status: 422 })
  }

  // Verifica quantidade mínima
  if (qty < coupon.minQuantity) {
    return NextResponse.json({
      valid: false,
      error: `Cupom válido apenas para pedidos com mínimo ${coupon.minQuantity} unidade(s).`,
    }, { status: 422 })
  }

  // Verifica restrição por listing
  if (coupon.listingId && coupon.listingId !== listingId) {
    return NextResponse.json({ valid: false, error: 'Cupom não válido para este produto.' }, { status: 422 })
  }

  // Calcula desconto
  let discountAmount = 0
  if (coupon.amountOff && Number(coupon.amountOff) > 0) {
    discountAmount = Math.min(subtotal, Number(coupon.amountOff))
  } else {
    discountAmount = subtotal * (coupon.percentOff / 100)
  }
  discountAmount = Math.round(discountAmount * 100) / 100

  const finalTotal = Math.max(0.01, subtotal - discountAmount)

  return NextResponse.json({
    valid:          true,
    code:           normalizedCode,
    description:    coupon.description,
    percentOff:     coupon.percentOff,
    amountOff:      coupon.amountOff ? Number(coupon.amountOff) : null,
    discountAmount,
    subtotal,
    finalTotal,
    expiresAt:      coupon.expiresAt?.toISOString() ?? null,
    usageRemaining: coupon.usageLimit != null ? coupon.usageLimit - coupon.usageCount : null,
  })
}
