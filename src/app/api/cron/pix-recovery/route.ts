/**
 * POST /api/cron/pix-recovery
 *
 * Recuperação de PIX Abandonado — dispara WhatsApp 15 min antes do PIX expirar.
 * Cria urgência real no momento em que o cliente ainda pode agir.
 *
 * Janela de alerta: PIX que expira entre agora+5min e agora+20min
 * (roda a cada 5 minutos via Vercel Cron)
 *
 * Impacto esperado: conversão de 15-25% dos abandonos = +R$30-60k/mês
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

// Janela: PIX que vai expirar nos próximos 5-20 minutos
const WINDOW_MIN_MS = 5  * 60 * 1000
const WINDOW_MAX_MS = 20 * 60 * 1000

function buildRecoveryMessage(params: {
  buyerName:    string
  productTitle: string
  totalAmount:  number
  pixCopyPaste: string
  resumeUrl:    string
  minutesLeft:  number
}) {
  return [
    `⏰ *Seu PIX está quase expirando — Ads Ativos*`,
    ``,
    `Olá, ${params.buyerName}!`,
    ``,
    `Você iniciou a compra de *${params.productTitle}* e o PIX gerado expira em *${params.minutesLeft} minuto${params.minutesLeft !== 1 ? 's' : ''}*.`,
    ``,
    `💰 Valor: *R$ ${params.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*`,
    ``,
    `📋 *PIX Copia e Cola (ainda válido):*`,
    params.pixCopyPaste,
    ``,
    `🔗 Ou acesse o checkout: ${params.resumeUrl}`,
    ``,
    `_Após expirar, você precisará gerar um novo PIX. Aproveite agora!_`,
  ].join('\n')
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now        = new Date()
  const windowMin  = new Date(now.getTime() + WINDOW_MIN_MS)
  const windowMax  = new Date(now.getTime() + WINDOW_MAX_MS)
  const appBase    = getPublicAppBaseUrl() ?? process.env.NEXTAUTH_URL ?? ''

  // PIX PENDING que vai expirar na janela e ainda não recebeu recovery
  const pending = await prisma.quickSaleCheckout.findMany({
    where: {
      status:    'PENDING',
      expiresAt: { gte: windowMin, lte: windowMax },
      recoveryMsgSentAt: null,
      pixCopyPaste: { not: null },
    },
    select: {
      id:           true,
      buyerName:    true,
      buyerWhatsapp: true,
      totalAmount:  true,
      expiresAt:    true,
      pixCopyPaste: true,
      listing: { select: { slug: true, title: true } },
    },
    take: 100,
  })

  let sent = 0, errors = 0

  for (const co of pending) {
    try {
      const minutesLeft = Math.max(1, Math.round(
        ((co.expiresAt?.getTime() ?? 0) - now.getTime()) / 60_000
      ))
      const resumeUrl = `${appBase}/loja/${co.listing.slug}?checkoutId=${encodeURIComponent(co.id)}`

      const ok = await sendWhatsApp({
        phone:   co.buyerWhatsapp,
        message: buildRecoveryMessage({
          buyerName:    co.buyerName,
          productTitle: co.listing.title,
          totalAmount:  Number(co.totalAmount),
          pixCopyPaste: co.pixCopyPaste!,
          resumeUrl,
          minutesLeft,
        }),
      })

      if (ok) {
        await prisma.quickSaleCheckout.update({
          where: { id: co.id },
          data:  { recoveryMsgSentAt: now },
        })
        sent++
      }
    } catch (e) {
      console.error('[pix-recovery]', co.id, e)
      errors++
    }
  }

  console.log(`[pix-recovery] processed=${pending.length} sent=${sent} errors=${errors}`)
  return NextResponse.json({ ok: true, processed: pending.length, sent, errors, ranAt: now.toISOString() })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
