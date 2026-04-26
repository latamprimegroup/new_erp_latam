/**
 * POST /api/cron/warranty-alert
 *
 * Alerta de Garantia Expirando — WhatsApp 48h antes da garantia terminar.
 * Cria urgência de renovação no momento em que o cliente ainda está engajado.
 *
 * Estratégia:
 *  - Detecta checkouts cuja garantia expira em 24-72h
 *  - Envia WhatsApp com oferta de renovação do mesmo produto
 *  - Inclui link de recompra pré-preenchido
 *
 * Roda 2x/dia via Vercel Cron (8h e 20h).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET       = process.env.CRON_SECRET
const ALERT_WINDOW_MIN  = 24   // horas mínimas até expirar
const ALERT_WINDOW_MAX  = 72   // horas máximas até expirar
const BATCH_SIZE        = 50

function buildWarrantyAlertMessage(params: {
  buyerName:     string
  productTitle:  string
  warrantyEndsAt: Date
  reorderUrl:    string
  hoursLeft:     number
}) {
  const daysLeft = Math.floor(params.hoursLeft / 24)
  const timeLabel = daysLeft >= 1 ? `${daysLeft} dia${daysLeft > 1 ? 's' : ''}` : `${Math.round(params.hoursLeft)}h`

  return [
    `🛡️ *Garantia expirando — Ads Ativos*`,
    ``,
    `Olá, ${params.buyerName}!`,
    ``,
    `Sua garantia do ativo *${params.productTitle}* expira em *${timeLabel}* (${params.warrantyEndsAt.toLocaleDateString('pt-BR')}).`,
    ``,
    `Antes de expirar, você ainda pode:`,
    `✅ Solicitar troca se houver qualquer problema`,
    `✅ Renovar com prioridade de fila`,
    ``,
    `👉 *Renovar agora com desconto de cliente fiel:*`,
    params.reorderUrl,
    ``,
    `_Quem renova antes da expiração tem prioridade no próximo lote._`,
    ``,
    `_Ads Ativos — Suporte: responda esta mensagem._`,
  ].join('\n')
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now        = new Date()
  const windowMin  = new Date(now.getTime() + ALERT_WINDOW_MIN * 3_600_000)
  const windowMax  = new Date(now.getTime() + ALERT_WINDOW_MAX * 3_600_000)
  const appBase    = getPublicAppBaseUrl() ?? process.env.NEXTAUTH_URL ?? ''

  // Checkouts PAID cuja garantia expira na janela, sem alerta enviado
  const eligible = await prisma.quickSaleCheckout.findMany({
    where: {
      status:              'PAID',
      warrantyEndsAt:      { gte: windowMin, lte: windowMax },
      warrantyAlertSentAt: null,
    },
    select: {
      id:            true,
      buyerName:     true,
      buyerWhatsapp: true,
      warrantyEndsAt: true,
      listing: {
        select: {
          slug:   true,
          title:  true,
          active: true,
        },
      },
    },
    take: BATCH_SIZE,
  })

  let sent = 0, errors = 0

  for (const co of eligible) {
    if (!co.warrantyEndsAt) continue

    try {
      const hoursLeft = (co.warrantyEndsAt.getTime() - now.getTime()) / 3_600_000
      const reorderUrl = co.listing.active
        ? `${appBase}/pay/one/new?slug=${encodeURIComponent(co.listing.slug)}`
        : `${appBase}/dashboard/venda-rapida`

      const ok = await sendWhatsApp({
        phone:   co.buyerWhatsapp,
        message: buildWarrantyAlertMessage({
          buyerName:     co.buyerName,
          productTitle:  co.listing.title,
          warrantyEndsAt: co.warrantyEndsAt,
          reorderUrl,
          hoursLeft,
        }),
      })

      if (ok) {
        await prisma.quickSaleCheckout.update({
          where: { id: co.id },
          data:  { warrantyAlertSentAt: now },
        })
        sent++
      }
    } catch (e) {
      console.error('[warranty-alert]', co.id, e)
      errors++
    }
  }

  console.log(`[warranty-alert] processed=${eligible.length} sent=${sent} errors=${errors}`)
  return NextResponse.json({ ok: true, processed: eligible.length, sent, errors, ranAt: now.toISOString() })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
