/**
 * GET /api/jobs/followup-messages
 *
 * Job de follow-up 48h pós-pagamento — Up-sell VIP.
 *
 * Dispara mensagem WhatsApp para compradores cujo pagamento foi confirmado
 * há mais de 48h e que ainda não receberam o follow-up.
 *
 * Configuração de cron recomendada (Vercel Cron / cron-job.org):
 *   Frequência: a cada 1 hora
 *   Authorization: header x-cron-secret = CRON_SECRET (env)
 *
 * Também pode ser chamado manualmente pelo ADMIN via painel.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

const FOLLOWUP_DELAY_HOURS = 48

async function sendFollowUp(params: {
  whatsapp: string
  buyerName: string
  productTitle: string
  checkoutId: string
  panelUrl: string
}): Promise<boolean> {
  const message = [
    `🚀 *Olá, ${params.buyerName}!*`,
    ``,
    `Como está a performance do seu ativo *${params.productTitle}*?`,
    ``,
    `Se precisar de mais escala para suas campanhas, temos ofertas exclusivas para clientes VIP no painel:`,
    `🔗 ${params.panelUrl}/loja`,
    ``,
    `💡 *Dica de ouro:* Clientes que escalam com múltiplos ativos reduzem risco e aumentam ROAS em até 3x.`,
    ``,
    `Qualquer dúvida ou problema com o seu ativo, acesse:`,
    `${params.panelUrl}/suporte/registrar-queda`,
    ``,
    `_Ads Ativos — Infraestrutura para quem pensa grande._`,
  ].join('\n')

  return sendWhatsApp({ phone: params.whatsapp, message })
}

export async function GET(req: NextRequest) {
  // Autenticação: aceita cron-secret header OU sessão ADMIN
  const cronSecret = process.env.CRON_SECRET?.trim()
  const headerSecret = req.headers.get('x-cron-secret')

  if (cronSecret && headerSecret !== cronSecret) {
    const session = await getServerSession(authOptions)
    if (session?.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
  }

  const appBase = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const cutoff  = new Date(Date.now() - FOLLOWUP_DELAY_HOURS * 60 * 60 * 1000)

  let processed = 0
  let sent      = 0
  let errors    = 0

  // ── QuickSaleCheckout ─────────────────────────────────────────────────────
  const quickPending = await prisma.quickSaleCheckout.findMany({
    where: {
      status:        'PAID',
      paidAt:        { lte: cutoff },
      followUpSentAt: null,
    },
    select: {
      id:           true,
      buyerName:    true,
      buyerWhatsapp: true,
      listing: { select: { title: true } },
    },
    take: 50, // processo em lotes para evitar timeout
  })

  for (const checkout of quickPending) {
    processed++
    try {
      const ok = await sendFollowUp({
        whatsapp:     checkout.buyerWhatsapp,
        buyerName:    checkout.buyerName,
        productTitle: checkout.listing.title,
        checkoutId:   checkout.id,
        panelUrl:     appBase,
      })
      if (ok) {
        await prisma.quickSaleCheckout.update({
          where: { id: checkout.id },
          data:  { followUpSentAt: new Date() },
        })
        sent++
      }
    } catch (e) {
      console.error('[FollowUp/Quick]', checkout.id, e)
      errors++
    }
  }

  // ── SalesCheckout ─────────────────────────────────────────────────────────
  const salesPending = await prisma.salesCheckout.findMany({
    where: {
      status:        'PAID',
      paidAt:        { lte: cutoff },
      followUpSentAt: null,
    },
    select: {
      id:     true,
      adsId:  true,
      lead: { select: { name: true, whatsapp: true } },
      asset:  { select: { displayName: true } },
    },
    take: 50,
  })

  for (const checkout of salesPending) {
    processed++
    try {
      const ok = await sendFollowUp({
        whatsapp:     checkout.lead.whatsapp,
        buyerName:    checkout.lead.name,
        productTitle: checkout.asset?.displayName ?? checkout.adsId,
        checkoutId:   checkout.id,
        panelUrl:     appBase,
      })
      if (ok) {
        await prisma.salesCheckout.update({
          where: { id: checkout.id },
          data:  { followUpSentAt: new Date() },
        })
        sent++
      }
    } catch (e) {
      console.error('[FollowUp/Sales]', checkout.id, e)
      errors++
    }
  }

  return NextResponse.json({
    ok:        true,
    processed,
    sent,
    errors,
    runAt:     new Date().toISOString(),
  })
}
