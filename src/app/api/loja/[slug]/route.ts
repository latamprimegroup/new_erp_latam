/**
 * GET  /api/loja/[slug] — Info do produto (público, sem autenticação)
 * POST /api/loja/[slug] — Gera checkout PIX para o listing
 */
import { NextResponse } from 'next/server'
import { z }           from 'zod'
import { randomUUID }  from 'crypto'
import { getServerSession } from 'next-auth/next'
import { prisma }      from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { generatePixCharge } from '@/lib/inter/client'
import { sendUtmifyPixGerado } from '@/lib/utmify'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'

const DELIVERY_FLOW = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  WAITING_CUSTOMER_DATA: 'WAITING_CUSTOMER_DATA',
  DELIVERY_REQUESTED: 'DELIVERY_REQUESTED',
  DELIVERY_IN_PROGRESS: 'DELIVERY_IN_PROGRESS',
  DELIVERED: 'DELIVERED',
} as const

// ─── GET: retorna info do produto OU status do checkout ───────────────────────

export async function GET(req: globalThis.Request, { params }: { params: { slug: string } }) {
  const { searchParams } = new URL(req.url)
  const checkoutId = searchParams.get('checkoutId')

  // Polling de status do checkout
  if (checkoutId) {
    const co = await prisma.quickSaleCheckout.findUnique({
      where:  { id: checkoutId },
      select: {
        status: true,
        paidAt: true,
        expiresAt: true,
        pixCopyPaste: true,
        pixQrCode: true,
        totalAmount: true,
        qty: true,
        deliveryFlowStatus: true,
        adspowerEmail: true,
        adspowerProfileReleased: true,
        deliveryRequestedAt: true,
        deliveryStatusNote: true,
        deliverySent: true,
        listing: { select: { slug: true, title: true } },
      },
    })
    if (!co) return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 })
    if (co.listing.slug !== params.slug) {
      return NextResponse.json({ error: 'Checkout não pertence a este produto' }, { status: 404 })
    }
    return NextResponse.json({
      status: co.status,
      paidAt: co.paidAt,
      expiresAt: co.expiresAt,
      pixCopyPaste: co.pixCopyPaste,
      qrCodeBase64: co.pixQrCode,
      totalAmount: Number(co.totalAmount),
      qty: co.qty,
      title: co.listing.title,
      delivery: {
        flowStatus: co.deliveryFlowStatus,
        adspowerEmail: co.adspowerEmail,
        adspowerProfileReleased: co.adspowerProfileReleased,
        deliveryRequestedAt: co.deliveryRequestedAt,
        deliveryStatusNote: co.deliveryStatusNote,
        deliverySent: co.deliverySent,
      },
    })
  }

  const listing = await prisma.productListing.findUnique({
    where: { slug: params.slug, active: true },
  })
  if (!listing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  // Conta estoque disponível — exclui ativos de fornecedores suspensos (stop-loss)
  const available = await prisma.asset.count({
    where: {
      category: listing.assetCategory as never,
      status:   'AVAILABLE',
      vendor:   { suspended: false },
    },
  })

  return NextResponse.json({
    id:           listing.id,
    slug:         listing.slug,
    title:        listing.title,
    subtitle:     listing.subtitle,
    badge:        listing.badge,
    pricePerUnit: Number(listing.pricePerUnit),
    maxQty:       Math.min(listing.maxQty, available),
    available,
  })
}

// ─── POST: gera PIX ───────────────────────────────────────────────────────────

const CPF_REGEX  = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/
const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/

const schema = z.object({
  name:         z.string().min(2).max(200),
  // Aceita CPF (PF) ou CNPJ (PJ) — validação por regex básico
  cpf:          z.string().regex(CPF_REGEX, 'CPF inválido').optional(),
  cnpj:         z.string().regex(CNPJ_REGEX, 'CNPJ inválido').optional(),
  whatsapp:     z.string().regex(/^\+?55\d{10,11}$/, 'WhatsApp inválido (+5511999999999)'),
  email:        z.string().email().optional().or(z.literal('')),
  qty:          z.number().int().min(1).max(50),
  sellerRef:    z.string().max(100).optional(), // sellerId codificado pelo vendedor
  utm_source:   z.string().max(100).optional(),
  utm_medium:   z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content:  z.string().max(200).optional(),
  utm_term:     z.string().max(200).optional(),
  src:          z.string().max(200).optional(),
  utmSrc:       z.string().max(200).optional(), // alias do campo src
  fbclid:       z.string().max(512).optional(),
  gclid:        z.string().max(512).optional(),
  referrer:     z.string().max(500).optional(),
}).refine((d) => d.cpf || d.cnpj, { message: 'Informe CPF (PF) ou CNPJ (PJ)', path: ['cpf'] })

export async function POST(req: globalThis.Request, { params }: { params: { slug: string } }) {
  const listing = await prisma.productListing.findUnique({
    where: { slug: params.slug, active: true },
  })
  if (!listing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const {
    name,
    cpf,
    cnpj,
    whatsapp,
    email,
    qty,
    sellerRef,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    src,
    utmSrc,
    fbclid,
    gclid,
    referrer,
  } = parsed.data
  const waE164    = whatsapp.startsWith('+') ? whatsapp : `+${whatsapp}`
  const cpfClean  = cpf?.replace(/\D/g, '')  ?? ''
  const cnpjClean = cnpj?.replace(/\D/g, '') ?? ''
  // Documento armazenado no campo buyerCpf (suporta CPF=11 ou CNPJ=14 dígitos)
  const buyerDoc  = cnpjClean.length === 14 ? cnpjClean : cpfClean

  const session = await getServerSession(authOptions).catch(() => null)
  let checkoutSellerId: string | null =
    session?.user?.role === 'COMMERCIAL' || session?.user?.role === 'ADMIN'
      ? session.user.id
      : null
  const checkoutManagerId =
    session?.user?.role === 'COMMERCIAL' ? session.user.leaderId ?? null : null

  // Se o link veio com ?ref= do vendedor e a sessão não tem seller, resolve pelo sellerRef
  if (!checkoutSellerId && sellerRef) {
    const sellerUser = await prisma.user.findFirst({
      where: { id: sellerRef, role: { in: ['COMMERCIAL', 'ADMIN'] } },
      select: { id: true },
    }).catch(() => null)
    if (sellerUser) checkoutSellerId = sellerUser.id
  }

  const totalAmount = Number(listing.pricePerUnit) * qty
  const txid        = randomUUID().replace(/-/g, '').slice(0, 35)

  // 1. Gera PIX ANTES de bloquear ativos (evita segurar estoque se o Inter falhar)
  let pixData: { txid: string; pixCopyPaste: string; qrCodeBase64: string; expiresAt: Date }
  try {
    pixData = await generatePixCharge({
      txid,
      amount:       totalAmount,
      buyerName:    name,
      ...(cnpjClean.length === 14
        ? { buyerCnpj: cnpjClean }
        : { buyerCpf:  cpfClean }),
      description:  `${qty}x ${listing.title} — Ads Ativos`,
      expiracaoSec: 1800,
    })
  } catch (err) {
    console.error('[Loja PIX]', err)
    return NextResponse.json({ error: 'Falha ao gerar PIX. Tente novamente.' }, { status: 502 })
  }

  // 2. Reserva ativos de forma ATÔMICA dentro da transação
  //    updateMany retorna { count } — se count < qty, outra requisição chegou primeiro
  let checkout: Awaited<ReturnType<typeof prisma.quickSaleCheckout.create>>
  try {
    checkout = await prisma.$transaction(async (tx) => {
      // Seleciona IDs dentro da transação para evitar leitura suja
      const candidates = await tx.asset.findMany({
        where:   { category: listing.assetCategory as never, status: 'AVAILABLE' },
        select:  { id: true },
        take:    qty,
        orderBy: { createdAt: 'asc' },
      })

      if (candidates.length < qty) {
        throw new Error(`STOCK_INSUFFICIENT:${candidates.length}`)
      }

      const assetIds = candidates.map((a) => a.id)

      // Reserva atômica: só afeta registros que AINDA estão AVAILABLE
      const { count } = await tx.asset.updateMany({
        where: { id: { in: assetIds }, status: 'AVAILABLE' },
        data:  { status: 'QUARANTINE' },
      })

      // Se count < qty, outro processo tomou alguns antes de nós
      if (count < qty) {
        throw new Error(`STOCK_RACE:${count}`)
      }

      return tx.quickSaleCheckout.create({
        data: {
          listingId:        listing.id,
          buyerName:        name,
          buyerCpf:         buyerDoc,   // CPF (11 dig) ou CNPJ (14 dig)
          buyerWhatsapp:    waE164,
          buyerEmail:       email || null,
          qty,
          totalAmount,
          status:           'PENDING',
          interTxid:        pixData.txid,
          pixCopyPaste:     pixData.pixCopyPaste,
          pixQrCode:        pixData.qrCodeBase64,
          expiresAt:        pixData.expiresAt,
          reservedAssetIds: assetIds,
          sellerId:         checkoutSellerId,
          managerId:        checkoutManagerId,
          deliveryFlowStatus: DELIVERY_FLOW.PENDING_PAYMENT,
          deliveryStatusNote: 'Aguardando pagamento PIX para liberar etapa de entrega.',
          utmSource:        utm_source   ?? null,
          utmMedium:        utm_medium   ?? null,
          utmCampaign:      utm_campaign ?? null,
          utmContent:       utm_content  ?? null,
          utmTerm:          utm_term     ?? null,
          utmSrc:           src ?? utmSrc ?? null,
          fbclid:           fbclid       ?? null,
          gclid:            gclid        ?? null,
          referrer:         referrer     ?? null,
        },
      })
    }, {
      // Isolamento máximo para evitar double-sell
      isolationLevel: 'Serializable',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('STOCK_INSUFFICIENT') || msg.startsWith('STOCK_RACE')) {
      const avail = msg.split(':')[1] ?? '0'
      return NextResponse.json({
        error: `Estoque insuficiente. Disponível: ${avail} unidade(s). Reduza a quantidade ou tente novamente.`,
      }, { status: 409 })
    }
    console.error('[Loja reserva]', err)
    return NextResponse.json({ error: 'Erro interno ao reservar estoque.' }, { status: 500 })
  }

  const baseUrl = getPublicAppBaseUrl() || new URL(req.url).origin
  const resumeUrl = `${baseUrl}/loja/${listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`

  sendUtmifyPixGerado({
    checkoutId: checkout.id,
    adsId: listing.id,
    displayName: listing.title,
    amountBrl: totalAmount,
    createdAt: checkout.createdAt,
    buyer: {
      name,
      email: email || '',
      whatsapp: waE164,
      cpf: buyerDoc,
    },
    utms: {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
    },
  }).catch((e) => console.error('[Utmify quick PIX_GERADO]', e))

  const whatsappMsg = [
    '🚀 *PIX GERADO — ADS ATIVOS*',
    '',
    `Produto: *${listing.title}*`,
    `Quantidade: *${qty}*`,
    `Valor: *R$ ${totalAmount.toFixed(2)}*`,
    '',
    '📋 *PIX Copia e Cola:*',
    pixData.pixCopyPaste,
    '',
    `🔳 *QR Code para pagamento:* ${resumeUrl}`,
    '',
    'Assim que o pagamento for aprovado, enviamos a confirmação automaticamente.',
  ].join('\n')

  sendWhatsApp({ phone: waE164, message: whatsappMsg })
    .catch((e) => console.error('[Loja WhatsApp PIX]', e))

  return NextResponse.json({
    checkoutId:   checkout.id,
    txid:         pixData.txid,
    pixCopyPaste: pixData.pixCopyPaste,
    qrCodeBase64: pixData.qrCodeBase64,
    expiresAt:    pixData.expiresAt.toISOString(),
    totalAmount,
    qty,
    title:        listing.title,
    resumeUrl,
  }, { status: 201 })
}

const deliverySchema = z.object({
  checkoutId: z.string().min(1),
  adspowerEmail: z.string().email('Informe um e-mail AdsPower válido'),
  adspowerProfileReleased: z.boolean(),
})

export async function PATCH(req: globalThis.Request, { params }: { params: { slug: string } }) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = deliverySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })
  }

  const { checkoutId, adspowerEmail, adspowerProfileReleased } = parsed.data
  if (!adspowerProfileReleased) {
    return NextResponse.json({
      error: 'É obrigatório confirmar que o perfil AdsPower está liberado para enviar a entrega.',
    }, { status: 422 })
  }

  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: checkoutId },
    select: {
      id: true,
      status: true,
      listing: { select: { slug: true } },
      deliveryFlowStatus: true,
    },
  })

  if (!checkout) return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 })
  if (checkout.listing.slug !== params.slug) {
    return NextResponse.json({ error: 'Checkout não pertence a este produto' }, { status: 404 })
  }
  if (checkout.status !== 'PAID') {
    return NextResponse.json({ error: 'A entrega só pode ser enviada após confirmação do pagamento.' }, { status: 409 })
  }

  const nextFlow =
    checkout.deliveryFlowStatus === DELIVERY_FLOW.DELIVERED
      ? DELIVERY_FLOW.DELIVERED
      : checkout.deliveryFlowStatus === DELIVERY_FLOW.DELIVERY_IN_PROGRESS
        ? DELIVERY_FLOW.DELIVERY_IN_PROGRESS
        : DELIVERY_FLOW.DELIVERY_REQUESTED

  const updated = await prisma.quickSaleCheckout.update({
    where: { id: checkout.id },
    data: {
      adspowerEmail: normalizeEmail(adspowerEmail),
      adspowerProfileReleased: true,
      deliveryRequestedAt: new Date(),
      deliveryFlowStatus: nextFlow,
      deliveryStatusNote: 'Dados de entrega recebidos. Equipe Ads Ativos validando e separando acesso.',
    },
    select: {
      id: true,
      deliveryFlowStatus: true,
      adspowerEmail: true,
      adspowerProfileReleased: true,
      deliveryRequestedAt: true,
      deliveryStatusNote: true,
      deliverySent: true,
    },
  })

  return NextResponse.json({
    ok: true,
    checkoutId: updated.id,
    delivery: {
      flowStatus: updated.deliveryFlowStatus,
      adspowerEmail: updated.adspowerEmail,
      adspowerProfileReleased: updated.adspowerProfileReleased,
      deliveryRequestedAt: updated.deliveryRequestedAt,
      deliveryStatusNote: updated.deliveryStatusNote,
      deliverySent: updated.deliverySent,
    },
  })
}

// ─── GET status do checkout ───────────────────────────────────────────────────
// Chamado pelo polling do frontend: GET /api/loja/[slug]?checkoutId=xxx

export async function HEAD(req: globalThis.Request) {
  const { searchParams } = new URL(req.url)
  const checkoutId = searchParams.get('checkoutId')
  if (!checkoutId) return new Response(null, { status: 400 })

  const co = await prisma.quickSaleCheckout.findUnique({
    where:  { id: checkoutId },
    select: { status: true },
  })
  if (!co) return new Response(null, { status: 404 })
  return new Response(null, { status: co.status === 'PAID' ? 200 : 202 })
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase()
}
