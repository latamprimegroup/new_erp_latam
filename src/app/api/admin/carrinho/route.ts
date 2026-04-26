/**
 * POST /api/admin/carrinho
 *
 * Gera um único PIX somando múltiplos listings (carrinho de compras interno).
 * Reserva ativos de cada listing atomicamente e cria um QuickSaleCheckout
 * por listing, retornando um PIX único com o valor total consolidado.
 *
 * Fluxo:
 *  1. Valida todos os listings e disponibilidade de estoque
 *  2. Gera 1 cobrança PIX Inter com valor total somado
 *  3. Cria um QuickSaleCheckout "principal" vinculado ao primeiro listing
 *     + registros filhos para os demais (como itens de pedido)
 *  4. Retorna o PIX + link de acompanhamento
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { generatePixCharge, InterApiError } from '@/lib/inter/client'
import { sendUtmifyPixGerado } from '@/lib/utmify'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'
import { z } from 'zod'

const QUICK_SALE_ORDER_SEQUENCE_KEY = 'quick_sale_order_sequence'
const MAX_RETRIES = 3

const itemSchema = z.object({
  listingId: z.string().min(1),
  qty:       z.number().int().min(1).max(50),
})

const schema = z.object({
  items:       z.array(itemSchema).min(1).max(20),
  buyerName:   z.string().min(2).max(200),
  buyerCpf:    z.string().regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/).optional(),
  buyerCnpj:   z.string().regex(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/).optional(),
  buyerWhatsapp: z.string().regex(/^\+?55\d{8,11}$/),
  buyerEmail:  z.string().email().optional().or(z.literal('')),
  /** Desconto total em R$ (para negociações comerciais) */
  descontoTotal: z.number().min(0).default(0),
  /** Nota interna do operador */
  note:        z.string().max(300).optional(),
}).refine((d) => d.buyerCpf || d.buyerCnpj, { message: 'Informe CPF ou CNPJ', path: ['buyerCpf'] })

function parseSequence(v: string | null | undefined) {
  const n = Number.parseInt(String(v ?? '').trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function formatOrderNumber(seq: number) {
  return `VR-${String(seq).padStart(6, '0')}`
}

export async function POST(req: NextRequest) {
  const auth = await requireRoles(['ADMIN', 'CEO', 'COMMERCIAL'])
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.flatten() }, { status: 422 })
  }

  const { items, buyerName, buyerCpf, buyerCnpj, buyerWhatsapp, buyerEmail, descontoTotal, note } = parsed.data
  const waE164    = buyerWhatsapp.startsWith('+') ? buyerWhatsapp : `+${buyerWhatsapp}`
  const cpfClean  = buyerCpf?.replace(/\D/g, '')  ?? ''
  const cnpjClean = buyerCnpj?.replace(/\D/g, '') ?? ''
  const buyerDoc  = cnpjClean.length === 14 ? cnpjClean : cpfClean

  // 1. Carrega todos os listings
  const listingIds = [...new Set(items.map((i) => i.listingId))]
  const listings = await prisma.productListing.findMany({
    where: { id: { in: listingIds }, active: true },
    select: {
      id: true, slug: true, title: true, subtitle: true,
      pricePerUnit: true, maxQty: true,
      assetCategory: true, stockProductCode: true, stockProductName: true,
    },
  })

  if (listings.length !== listingIds.length) {
    const missing = listingIds.filter((id) => !listings.find((l) => l.id === id))
    return NextResponse.json({ error: `Listing(s) não encontrado(s) ou inativo(s): ${missing.join(', ')}` }, { status: 404 })
  }

  const listingMap = new Map(listings.map((l) => [l.id, l]))

  // 2. Calcula totais
  let subtotal = 0
  const lineItems: Array<{
    listing: typeof listings[0]
    qty: number
    unitPrice: number
    lineTotal: number
  }> = []

  for (const item of items) {
    const listing = listingMap.get(item.listingId)!
    const unitPrice = Number(listing.pricePerUnit)
    const qty = Math.min(item.qty, listing.maxQty)
    const lineTotal = unitPrice * qty
    subtotal += lineTotal
    lineItems.push({ listing, qty, unitPrice, lineTotal })
  }

  const desconto    = Math.min(descontoTotal, subtotal)
  const totalAmount = Math.max(0.01, subtotal - desconto)

  // 3. Gera PIX único com valor consolidado
  const txid = randomUUID().replace(/-/g, '').slice(0, 35)
  const description = lineItems.length === 1
    ? `${lineItems[0].qty}x ${lineItems[0].listing.title} — Ads Ativos`
    : `${lineItems.length} produtos — Ads Ativos (R$ ${totalAmount.toFixed(2)})`

  let pixData: { txid: string; pixCopyPaste: string; qrCodeBase64: string; expiresAt: Date }
  try {
    pixData = await generatePixCharge({
      txid,
      amount:      totalAmount,
      buyerName,
      ...(cnpjClean.length === 14 ? { buyerCnpj: cnpjClean } : { buyerCpf: cpfClean }),
      description,
      expiracaoSec: 1800,
      extra: lineItems.map((li) => ({
        nome:  li.listing.title.slice(0, 50),
        valor: `${li.qty}x R$ ${li.unitPrice.toFixed(2)}`,
      })),
    })
  } catch (err) {
    console.error('[Carrinho PIX]', err)
    const msg = err instanceof InterApiError
      ? `Falha no Banco Inter: ${err.body.slice(0, 100)}`
      : 'Falha ao gerar PIX. Tente novamente.'
    return NextResponse.json({ error: msg, code: 'PIX_GENERATION_FAILED' }, { status: 502 })
  }

  // 4. Reserva ativos e cria checkouts atomicamente
  await prisma.systemSetting.upsert({
    where: { key: QUICK_SALE_ORDER_SEQUENCE_KEY },
    create: { key: QUICK_SALE_ORDER_SEQUENCE_KEY, value: '0' },
    update: {},
  })

  let orderNumber: string | null = null
  const createdCheckoutIds: string[] = []

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Incrementa sequência (upsert garante criação se não existir)
        const seq = await tx.systemSetting.findUnique({
          where: { key: QUICK_SALE_ORDER_SEQUENCE_KEY },
          select: { id: true, value: true },
        })
        const nextSeq = parseSequence(seq?.value) + 1
        await tx.systemSetting.upsert({
          where: { key: QUICK_SALE_ORDER_SEQUENCE_KEY },
          create: { key: QUICK_SALE_ORDER_SEQUENCE_KEY, value: String(nextSeq) },
          update: { value: String(nextSeq) },
        })
        const orderNum = formatOrderNumber(nextSeq)

        const checkoutIds: string[] = []

        // Cria um checkout por item (reserva ativos de cada listing)
        for (let i = 0; i < lineItems.length; i++) {
          const li = lineItems[i]
          const isFirst = i === 0

          // Reserva ativos
          const candidates = await tx.asset.findMany({
            where: {
              status: 'AVAILABLE',
              category: li.listing.assetCategory as never,
              ...(li.listing.stockProductCode ? {
                OR: [
                  { adsId: li.listing.stockProductCode.trim().toUpperCase() },
                  { specs: { path: '$.productCode', equals: li.listing.stockProductCode.trim().toUpperCase() } },
                ],
              } : {}),
            },
            select: { id: true },
            take: li.qty,
            orderBy: { createdAt: 'asc' },
          })

          if (candidates.length < li.qty) {
            throw new Error(`STOCK_INSUFFICIENT:${li.listing.title}:${candidates.length}`)
          }

          const assetIds = candidates.map((a) => a.id)
          const { count } = await tx.asset.updateMany({
            where: { id: { in: assetIds }, status: 'AVAILABLE' },
            data:  { status: 'QUARANTINE' },
          })
          if (count < li.qty) throw new Error(`STOCK_RACE:${li.listing.title}`)

          // Cria checkout para este item
          // Primeiro item usa o PIX real; os demais ficam PENDING vinculados ao mesmo txid
          const checkout = await tx.quickSaleCheckout.create({
            data: {
              listingId:    li.listing.id,
              buyerName,
              buyerCpf:     buyerDoc,
              buyerWhatsapp: waE164,
              buyerEmail:   buyerEmail || null,
              qty:          li.qty,
              totalAmount:  isFirst ? totalAmount : li.lineTotal,
              status:       'PENDING',
              interTxid:    isFirst ? pixData.txid : null,
              pixCopyPaste: isFirst ? pixData.pixCopyPaste : null,
              pixQrCode:    isFirst ? pixData.qrCodeBase64 : null,
              expiresAt:    pixData.expiresAt,
              reservedAssetIds: assetIds,
              sellerId:     auth.session.user.id,
              deliveryFlowStatus: 'PENDING_PAYMENT',
              deliveryStatusNote: isFirst
                ? `Pedido ${orderNum} · ${lineItems.length} produto(s) · Total R$ ${totalAmount.toFixed(2)}`
                : `Vinculado ao pedido ${orderNum} · Item ${i + 1}/${lineItems.length}`,
            },
          })
          checkoutIds.push(checkout.id)
        }

        // Salva referência do número de pedido para o primeiro checkout
        if (checkoutIds[0]) {
          await tx.systemSetting.upsert({
            where: { key: `quick_sale_order_ref:${checkoutIds[0]}` },
            create: { key: `quick_sale_order_ref:${checkoutIds[0]}`, value: orderNum },
            update: { value: orderNum },
          })
        }

        return { orderNum, checkoutIds }
      }, { isolationLevel: 'Serializable' })

      orderNumber = result.orderNum
      createdCheckoutIds.push(...result.checkoutIds)
      break
    } catch (err) {
      const msg = String((err as Error).message ?? '')
      if (msg.startsWith('STOCK_INSUFFICIENT') || msg.startsWith('STOCK_RACE')) {
        const parts = msg.split(':')
        return NextResponse.json({
          error: `Estoque insuficiente para "${parts[1] ?? 'produto'}". Disponível: ${parts[2] ?? '0'} unidade(s).`,
        }, { status: 409 })
      }
      if (attempt < MAX_RETRIES) continue
      throw err
    }
  }

  const baseUrl    = getPublicAppBaseUrl() || new URL(req.url).origin
  const resumeUrl  = `${baseUrl}/loja/${lineItems[0].listing.slug}?checkoutId=${encodeURIComponent(createdCheckoutIds[0] ?? '')}`

  // 5. Utmify — evento PIX gerado para o primeiro item
  sendUtmifyPixGerado({
    checkoutId:  createdCheckoutIds[0] ?? '',
    adsId:       lineItems[0].listing.id,
    displayName: lineItems.length === 1
      ? lineItems[0].listing.title
      : `Carrinho ${lineItems.length} produtos`,
    amountBrl:   totalAmount,
    createdAt:   new Date(),
    buyer: { name: buyerName, email: buyerEmail || '', whatsapp: waE164, cpf: buyerDoc },
    utms: {},
  }).catch((e) => console.error('[Carrinho Utmify]', e))

  // 6. WhatsApp com resumo do carrinho
  const prodLines = lineItems.map((li) =>
    `  • ${li.qty}x ${li.listing.title} — R$ ${li.lineTotal.toFixed(2)}`
  ).join('\n')
  const whatsappMsg = [
    `🛒 *CARRINHO GERADO — ADS ATIVOS*`,
    ``,
    `Pedido: *${orderNumber ?? createdCheckoutIds[0]}*`,
    ``,
    `*Produtos:*`,
    prodLines,
    desconto > 0 ? `\nDesconto: -R$ ${desconto.toFixed(2)}` : '',
    `*Total: R$ ${totalAmount.toFixed(2)}*`,
    ``,
    `📋 *PIX Copia e Cola:*`,
    pixData.pixCopyPaste,
    ``,
    `🔳 Acompanhar pedido: ${resumeUrl}`,
    note ? `\nObs: ${note}` : '',
  ].filter(Boolean).join('\n')

  sendWhatsApp({ phone: waE164, message: whatsappMsg })
    .catch((e) => console.error('[Carrinho WhatsApp]', e))

  await prisma.auditLog.create({
    data: {
      action: 'CARRINHO_PIX_CRIADO',
      entity: 'QuickSaleCheckout',
      entityId: createdCheckoutIds[0] ?? '',
      userId: auth.session.user.id,
      details: {
        orderNumber,
        checkoutIds: createdCheckoutIds,
        lineItems: lineItems.map((li) => ({ listingId: li.listing.id, title: li.listing.title, qty: li.qty, lineTotal: li.lineTotal })),
        subtotal, desconto, totalAmount,
        buyerName, buyerDoc, buyerWhatsapp: waE164,
      },
    },
  }).catch(() => {})

  return NextResponse.json({
    ok:            true,
    orderNumber,
    checkoutId:    createdCheckoutIds[0],
    checkoutIds:   createdCheckoutIds,
    txid:          pixData.txid,
    pixCopyPaste:  pixData.pixCopyPaste,
    qrCodeBase64:  pixData.qrCodeBase64,
    expiresAt:     pixData.expiresAt.toISOString(),
    subtotal,
    desconto,
    totalAmount,
    resumeUrl,
    lineItems: lineItems.map((li) => ({
      listingId: li.listing.id,
      title:     li.listing.title,
      qty:       li.qty,
      unitPrice: li.unitPrice,
      lineTotal: li.lineTotal,
    })),
  }, { status: 201 })
}
