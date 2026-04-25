/**
 * POST /api/checkout/pix
 *
 * Fluxo:
 *  1. Valida dados do comprador (nome, CPF, WhatsApp) + adsId
 *  2. Salva Lead no banco (para remarketing, mesmo que não pague)
 *  3. Busca o Asset e verifica disponibilidade + preço
 *  4. Gera cobrança PIX via Banco Inter (mTLS + OAuth2)
 *  5. Cria SalesCheckout com txid, pix copia-e-cola, QR code e expiração
 *  6. Retorna dados do PIX ao frontend
 *
 * Rota pública — sem autenticação (é o checkout externo do cliente)
 */

import { NextResponse } from 'next/server'
import { z }            from 'zod'
import { randomUUID }   from 'crypto'
import { prisma }       from '@/lib/prisma'
import { generatePixCharge } from '@/lib/inter/client'
import { sendUtmifyPixGerado } from '@/lib/utmify'

// ─── Validação ────────────────────────────────────────────────────────────────

const schema = z.object({
  adsId:      z.string().min(3).max(60),
  name:       z.string().min(2).max(200),
  cpf:        z.string().regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'CPF inválido'),
  whatsapp:   z.string().regex(/^\+?55\d{10,11}$/, 'WhatsApp deve estar no formato +5511999999999'),
  email:      z.string().email().optional().or(z.literal('')),
  // UTMs capturados no frontend via URL params / cookie / localStorage (30 dias)
  utm_source:   z.string().max(100).optional(),
  utm_medium:   z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content:  z.string().max(200).optional(),
  utm_term:     z.string().max(200).optional(),
  utmSrc:       z.string().max(200).optional(),
  fbclid:       z.string().max(512).optional(),
  gclid:        z.string().max(512).optional(),
  referrer:     z.string().max(500).optional(),
})

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: globalThis.Request) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })
  }

  const {
    adsId, name, cpf, whatsapp, email,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    utmSrc, fbclid, gclid, referrer,
  } = parsed.data

  // 1. Verifica ativo disponível
  const asset = await prisma.asset.findFirst({
    where: { adsId, status: 'AVAILABLE' },
    select: { id: true, adsId: true, salePrice: true, displayName: true, status: true },
  })

  if (!asset) {
    return NextResponse.json({ error: 'Ativo não disponível ou não encontrado.' }, { status: 404 })
  }

  if (!asset.salePrice || Number(asset.salePrice) <= 0) {
    return NextResponse.json({ error: 'Ativo sem preço configurado. Entre em contato com o suporte.' }, { status: 400 })
  }

  const amount = Number(asset.salePrice)

  // 2. Salva Lead (para remarketing mesmo se não pagar)
  const whatsappE164 = whatsapp.startsWith('+') ? whatsapp : `+${whatsapp}`
  const cpfClean     = cpf.replace(/\D/g, '')

  const lead = await prisma.lead.upsert({
    where:  { id: 'noop' },   // forçamos create — upsert por CPF+WhatsApp abaixo
    create: {
      name, cpf: cpfClean, whatsapp: whatsappE164,
      email:       email || null,
      adsId,
      utmSource:   utm_source   || null,
      utmMedium:   utm_medium   || null,
      utmCampaign: utm_campaign || null,
      utmContent:  utm_content  || null,
      utmTerm:     utm_term     || null,
      fbclid:      fbclid       || null,
      gclid:       gclid        || null,
      referrer:    referrer     || null,
    },
    update: {},
  }).catch(async () => {
    return prisma.lead.create({
      data: {
        name, cpf: cpfClean, whatsapp: whatsappE164,
        email:       email || null,
        adsId,
        utmSource:   utm_source   || null,
        utmMedium:   utm_medium   || null,
        utmCampaign: utm_campaign || null,
        utmContent:  utm_content  || null,
        utmTerm:     utm_term     || null,
        fbclid:      fbclid       || null,
        gclid:       gclid        || null,
        referrer:    referrer     || null,
      },
    })
  })

  // 3. Gera PIX no Banco Inter
  const txid = randomUUID().replace(/-/g, '').slice(0, 35)

  let pixData: { txid: string; pixCopyPaste: string; qrCodeBase64: string; expiresAt: Date }

  try {
    pixData = await generatePixCharge({
      txid,
      amount,
      buyerName:   name,
      buyerCpf:    cpfClean,
      description: `Conta Google Ads ${adsId} — Ads Ativos`,
      expiracaoSec: 1800,  // 30 minutos
    })
  } catch (err) {
    console.error('[Checkout PIX] Erro ao gerar PIX Inter:', err)
    return NextResponse.json(
      { error: 'Falha ao gerar PIX. Tente novamente em instantes.' },
      { status: 502 },
    )
  }

  // 4. Cria SalesCheckout no banco
  const checkout = await prisma.salesCheckout.create({
    data: {
      leadId:       lead.id,
      adsId,
      assetId:      asset.id,
      amount,
      status:       'PENDING',
      interTxid:    pixData.txid,
      pixCopyPaste: pixData.pixCopyPaste,
      pixQrCode:    pixData.qrCodeBase64,
      expiresAt:    pixData.expiresAt,
    },
  })

  // 5. Dispara evento PIX_GERADO para Utmify (fire-and-forget)
  sendUtmifyPixGerado({
    checkoutId:  checkout.id,
    adsId,
    displayName: asset.displayName ?? adsId,
    amountBrl:   amount,
    createdAt:   checkout.createdAt,
    buyer: { name, email: email ?? '', whatsapp: whatsappE164, cpf: cpfClean },
    utms: {
      utm_source:   utm_source,
      utm_medium:   utm_medium,
      utm_campaign: utm_campaign,
      utm_content:  utm_content,
      utm_term:     utm_term,
    },
  }).catch((e) => console.error('[Utmify PIX_GERADO]', e))

  // 6. Resposta ao frontend
  return NextResponse.json({
    checkoutId:   checkout.id,
    txid:         pixData.txid,
    pixCopyPaste: pixData.pixCopyPaste,
    qrCodeBase64: pixData.qrCodeBase64,
    expiresAt:    pixData.expiresAt.toISOString(),
    amount,
    adsId,
    displayName:  asset.displayName,
  }, { status: 201 })
}

// ─── GET — consulta status do checkout ───────────────────────────────────────

export async function GET(req: globalThis.Request) {
  const { searchParams } = new URL(req.url)
  const checkoutId = searchParams.get('id')

  if (!checkoutId) {
    return NextResponse.json({ error: 'Parâmetro "id" obrigatório' }, { status: 400 })
  }

  const checkout = await prisma.salesCheckout.findUnique({
    where:  { id: checkoutId },
    select: {
      id: true, status: true, adsId: true, amount: true,
      expiresAt: true, paidAt: true, deliverySent: true,
    },
  })

  if (!checkout) {
    return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 })
  }

  return NextResponse.json(checkout)
}
