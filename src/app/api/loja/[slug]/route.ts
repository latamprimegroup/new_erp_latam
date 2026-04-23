/**
 * GET  /api/loja/[slug] — Info do produto (público, sem autenticação)
 * POST /api/loja/[slug] — Gera checkout PIX para o listing
 */
import { NextResponse } from 'next/server'
import { z }           from 'zod'
import { randomUUID }  from 'crypto'
import { prisma }      from '@/lib/prisma'
import { generatePixCharge } from '@/lib/inter/client'

// ─── GET: retorna info do produto OU status do checkout ───────────────────────

export async function GET(req: globalThis.Request, { params }: { params: { slug: string } }) {
  const { searchParams } = new URL(req.url)
  const checkoutId = searchParams.get('checkoutId')

  // Polling de status do checkout
  if (checkoutId) {
    const co = await prisma.quickSaleCheckout.findUnique({
      where:  { id: checkoutId },
      select: { status: true, paidAt: true },
    })
    if (!co) return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 })
    return NextResponse.json({ status: co.status, paidAt: co.paidAt })
  }

  const listing = await prisma.productListing.findUnique({
    where: { slug: params.slug, active: true },
  })
  if (!listing) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  // Conta estoque disponível
  const available = await prisma.asset.count({
    where: {
      category: listing.assetCategory as never,
      status:   'AVAILABLE',
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

const schema = z.object({
  name:         z.string().min(2).max(200),
  cpf:          z.string().regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'CPF inválido'),
  whatsapp:     z.string().regex(/^\+?55\d{10,11}$/, 'WhatsApp inválido (+5511999999999)'),
  email:        z.string().email().optional().or(z.literal('')),
  qty:          z.number().int().min(1).max(50),
  utm_source:   z.string().max(100).optional(),
  utm_medium:   z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
})

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

  const { name, cpf, whatsapp, email, qty, utm_source, utm_medium, utm_campaign } = parsed.data
  const waE164   = whatsapp.startsWith('+') ? whatsapp : `+${whatsapp}`
  const cpfClean = cpf.replace(/\D/g, '')

  const totalAmount = Number(listing.pricePerUnit) * qty
  const txid        = randomUUID().replace(/-/g, '').slice(0, 35)

  // 1. Gera PIX ANTES de bloquear ativos (evita segurar estoque se o Inter falhar)
  let pixData: { txid: string; pixCopyPaste: string; qrCodeBase64: string; expiresAt: Date }
  try {
    pixData = await generatePixCharge({
      txid,
      amount:       totalAmount,
      buyerName:    name,
      buyerCpf:     cpfClean,
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
          buyerCpf:         cpfClean,
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
          utmSource:        utm_source   ?? null,
          utmMedium:        utm_medium   ?? null,
          utmCampaign:      utm_campaign ?? null,
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

  return NextResponse.json({
    checkoutId:   checkout.id,
    txid:         pixData.txid,
    pixCopyPaste: pixData.pixCopyPaste,
    qrCodeBase64: pixData.qrCodeBase64,
    expiresAt:    pixData.expiresAt.toISOString(),
    totalAmount,
    qty,
    title:        listing.title,
  }, { status: 201 })
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
