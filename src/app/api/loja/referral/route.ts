/**
 * GET  /api/loja/referral?checkoutId=xxx
 * Gera um link de indicação único para o comprador pós-pagamento.
 * O link embute um cupom de desconto automático para o indicado
 * e rastreia a origem para comissão futura ao indicador.
 *
 * POST /api/loja/referral
 * Registra conversão de um referral (quando o indicado finaliza a compra).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import { z } from 'zod'
import { randomBytes } from 'crypto'

const REFERRAL_DISCOUNT_PCT = 10  // desconto para o indicado
const REFERRAL_SETTING_PREFIX = 'referral:'

export async function GET(req: NextRequest) {
  const checkoutId = req.nextUrl.searchParams.get('checkoutId')
  if (!checkoutId) return NextResponse.json({ error: 'checkoutId obrigatório.' }, { status: 400 })

  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: checkoutId, status: 'PAID' },
    select: {
      id: true, buyerName: true,
      listing: { select: { slug: true, title: true } },
    },
  })
  if (!checkout) return NextResponse.json({ error: 'Checkout não encontrado.' }, { status: 404 })

  // Verifica se já existe referral para este checkout
  const existingKey = `${REFERRAL_SETTING_PREFIX}${checkoutId}`
  const existing = await prisma.systemSetting.findUnique({ where: { key: existingKey } })

  let referralData: { token: string; couponCode: string; url: string }

  if (existing) {
    const d = JSON.parse(existing.value) as typeof referralData
    referralData = d
  } else {
    // Gera token único e cupom automático
    const token      = randomBytes(8).toString('hex')
    const couponCode = `IND-${token.toUpperCase().slice(0, 8)}`

    // Cria cupom de desconto automático para o indicado
    await prisma.commercialCoupon.upsert({
      where: { code: couponCode },
      create: {
        code:        couponCode,
        percentOff:  REFERRAL_DISCOUNT_PCT,
        description: `Desconto de indicação — ${checkout.buyerName}`,
        active:      true,
        usageLimit:  1,   // 1 uso por cupom de indicação
        expiresAt:   new Date(Date.now() + 30 * 24 * 3_600_000), // 30 dias
      },
      update: {},
    })

    const appBase = getPublicAppBaseUrl() ?? process.env.NEXTAUTH_URL ?? ''
    const url = `${appBase}/loja/${checkout.listing.slug}?ref=${token}&cupom=${couponCode}`

    referralData = { token, couponCode, url }

    await prisma.systemSetting.create({
      data: {
        key:   existingKey,
        value: JSON.stringify({
          ...referralData,
          checkoutId,
          buyerName: checkout.buyerName,
          listingSlug: checkout.listing.slug,
          listingTitle: checkout.listing.title,
          createdAt: new Date().toISOString(),
          conversions: 0,
        }),
      },
    })
  }

  return NextResponse.json({
    referralUrl:    referralData.url,
    couponCode:     referralData.couponCode,
    discountPct:    REFERRAL_DISCOUNT_PCT,
    message: `Compartilhe este link e seu amigo ganha ${REFERRAL_DISCOUNT_PCT}% de desconto!`,
  })
}

const registerSchema = z.object({
  token:      z.string().min(1),
  checkoutId: z.string().min(1), // checkout do indicado
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 422 })

  const { token, checkoutId } = parsed.data

  // Encontra referral pelo token
  const settings = await prisma.systemSetting.findMany({
    where: { key: { startsWith: REFERRAL_SETTING_PREFIX } },
  })

  const referralSetting = settings.find((s) => {
    try { return (JSON.parse(s.value) as { token: string }).token === token }
    catch { return false }
  })

  if (!referralSetting) return NextResponse.json({ error: 'Token de indicação inválido.' }, { status: 404 })

  const data = JSON.parse(referralSetting.value) as {
    token: string; conversions: number; buyerName: string
  }
  await prisma.systemSetting.update({
    where: { key: referralSetting.key },
    data:  { value: JSON.stringify({ ...data, conversions: data.conversions + 1, lastConversionAt: new Date().toISOString(), lastConversionCheckoutId: checkoutId }) },
  })

  return NextResponse.json({ ok: true })
}
