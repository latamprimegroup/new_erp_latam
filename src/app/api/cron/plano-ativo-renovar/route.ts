/**
 * POST /api/cron/plano-ativo-renovar
 *
 * Renovação automática de Planos de Ativos.
 * Detecta planos com nextRenewalAt <= hoje e envia WhatsApp com link PIX de renovação.
 * O cliente paga o PIX e a entrega é processada normalmente pelo fluxo padrão.
 *
 * Roda 1x/dia às 9h via Vercel Cron.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { getPublicAppBaseUrl } from '@/lib/public-app-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET  = process.env.CRON_SECRET
const PLANO_PREFIX = 'plano_ativo:'

interface PlanoData {
  id:             string
  listingId:      string
  listingTitle:   string
  listingSlug:    string
  clientName:     string
  clientWhatsapp: string
  clientEmail:    string | null
  qtyPerMonth:    number
  monthlyAmount:  number
  billingDay:     number
  nextRenewalAt:  string
  status:         string
  renewalCount:   number
  note:           string | null
}

function calcNextRenewal(billingDay: number) {
  const now  = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, billingDay)
  return next
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now     = new Date()
  const appBase = getPublicAppBaseUrl() ?? process.env.NEXTAUTH_URL ?? ''

  // Busca todos os planos ativos
  const settings = await prisma.systemSetting.findMany({
    where: { key: { startsWith: PLANO_PREFIX } },
  })

  let processed = 0, sent = 0, errors = 0

  for (const s of settings) {
    let plan: PlanoData
    try { plan = JSON.parse(s.value) as PlanoData }
    catch { continue }

    if (plan.status !== 'ACTIVE') continue

    const renewalDate = new Date(plan.nextRenewalAt)
    if (renewalDate > now) continue // não é hoje ainda

    processed++

    try {
      // Link de pagamento para renovação (checkout público do listing)
      const renewalUrl = `${appBase}/pay/one/new?slug=${encodeURIComponent(plan.listingSlug)}`

      const msg = [
        `🔄 *Renovação do Plano de Ativos — Ads Ativos*`,
        ``,
        `Olá, ${plan.clientName}!`,
        ``,
        `Chegou o dia da renovação do seu plano:`,
        `📦 Produto: *${plan.listingTitle}*`,
        `📊 Quantidade: *${plan.qtyPerMonth} ativo(s)*`,
        `💰 Valor: *R$ ${plan.monthlyAmount.toFixed(2)}*`,
        ``,
        `👉 *Clique abaixo para gerar o PIX de renovação:*`,
        renewalUrl,
        ``,
        `Após o pagamento, a entrega será processada automaticamente.`,
        ``,
        `_Responda esta mensagem se tiver qualquer dúvida._`,
        `_Ads Ativos — Renovação #${plan.renewalCount + 1}_`,
      ].join('\n')

      const ok = await sendWhatsApp({ phone: plan.clientWhatsapp, message: msg })

      if (ok) {
        // Atualiza nextRenewalAt para o próximo mês
        const nextDate = calcNextRenewal(plan.billingDay)
        const updatedPlan: PlanoData = {
          ...plan,
          nextRenewalAt: nextDate.toISOString(),
          renewalCount:  plan.renewalCount + 1,
        }
        await prisma.systemSetting.update({
          where: { key: s.key },
          data:  { value: JSON.stringify(updatedPlan) },
        })

        await prisma.auditLog.create({
          data: {
            action: 'PLANO_ATIVO_RENOVADO',
            entity: 'SystemSetting',
            entityId: plan.id,
            details: {
              planId:       plan.id,
              clientName:   plan.clientName,
              renewalCount: updatedPlan.renewalCount,
              nextRenewalAt: updatedPlan.nextRenewalAt,
              renewalUrl,
            },
          },
        }).catch(() => {})

        sent++
      }
    } catch (e) {
      console.error('[plano-ativo-renovar]', plan.id, e)
      errors++
    }
  }

  console.log(`[plano-ativo-renovar] processed=${processed} sent=${sent} errors=${errors}`)
  return NextResponse.json({ ok: true, processed, sent, errors, ranAt: now.toISOString() })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
