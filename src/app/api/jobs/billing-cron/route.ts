/**
 * GET /api/jobs/billing-cron
 *
 * Motor de Cobrança Assíncrono — executa diariamente via cron externo.
 * Recomendado: Vercel Cron Jobs ou cron.job.io chamando este endpoint às 09:00 BRT.
 *
 * Autenticação: Bearer token via CRON_SECRET ou ADMIN role.
 *
 * Lógica por método de pagamento:
 *
 *   PIX_INTER (3 dias antes do vencimento):
 *     1. Gera nova cobrança PIX via Banco Inter API v2
 *     2. Salva pixTxid + pixCopyPaste na assinatura
 *     3. Envia PIX Copia e Cola via WhatsApp + E-mail
 *
 *   CARD_PAGSMILE (no dia do vencimento):
 *     1. Tenta cobrança via token salvo
 *     2. Se falhar → incrementa retryCount (webhook do Pagsmile atualiza status)
 *     3. Após MAX_RETRIES falhas → PAST_DUE (bloqueio de acesso automático)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generatePixCharge } from '@/lib/inter/client'
import { chargeCardToken } from '@/lib/pagsmile/client'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'
import { sendEmail } from '@/lib/notifications/channels/email'
import { BRAND } from '@/lib/brand'
import { addDays, addMonths, addQuarters, format, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min (Vercel Pro)

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  const session = await getServerSession(authOptions).catch(() => null)
  return (session?.user as { role?: string } | undefined)?.role === 'ADMIN'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextBillingDate(cycle: string, from: Date = new Date()): Date {
  if (cycle === 'QUARTERLY') return addQuarters(from, 1)
  if (cycle === 'ANNUAL') {
    const d = new Date(from)
    d.setFullYear(d.getFullYear() + 1)
    return d
  }
  return addMonths(from, 1)
}

function pixBillingMessage(params: {
  clientName: string
  planName:   string
  amount:     number
  currency:   string
  pixCopy:    string
  dueDate:    Date
  panelUrl:   string
}): string {
  const fmt  = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const due  = format(params.dueDate, "dd/MM/yyyy", { locale: ptBR })
  return [
    `🔔 *RENOVAÇÃO DE ASSINATURA — ${BRAND.name}*`,
    ``,
    `Olá, *${params.clientName}*! Sua assinatura *${params.planName}* vence em breve.`,
    ``,
    `💰 Valor: *${fmt.format(params.amount)}*`,
    `📅 Vencimento: *${due}*`,
    ``,
    `📲 *PIX Copia e Cola:*`,
    `\`${params.pixCopy}\``,
    ``,
    `Ou acesse seu painel para pagar:`,
    params.panelUrl,
    ``,
    `_${BRAND.name} · ${BRAND.taglinePT}_`,
  ].join('\n')
}

// ─── Rota principal ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const now         = new Date()
  const in3days     = addDays(now, 3)
  const panelBase   = process.env.NEXTAUTH_URL ?? ''

  // Busca assinaturas que vencem nos próximos 3 dias (PIX) ou hoje (Cartão)
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status:       { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
      nextBillingAt: { lte: in3days },
    },
    include: {
      client: {
        select: {
          id:       true,
          whatsapp: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
    take: 200,
  })

  const results = {
    processed: 0,
    pixSent:   0,
    cardCharged: 0,
    pastDue:   0,
    errors:    0,
    detail:    [] as string[],
  }

  for (const sub of subscriptions) {
    const clientName = sub.client.user?.name ?? 'Cliente'
    const email      = sub.client.user?.email ?? null
    const whatsapp   = sub.client.whatsapp ?? null
    const billingAt  = sub.nextBillingAt ? new Date(sub.nextBillingAt) : null

    if (!billingAt) continue
    results.processed++

    try {
      // ── PIX_INTER — gera 3 dias antes ─────────────────────────────────────
      if (sub.paymentMethod === 'PIX_INTER') {
        // Só gera se o PIX anterior expirou ou não existe
        const pixExpiry = sub.lastPixExpiresAt ? new Date(sub.lastPixExpiresAt) : null
        if (pixExpiry && isBefore(now, pixExpiry)) {
          results.detail.push(`[SKIP] ${sub.id} — PIX ainda válido até ${pixExpiry.toISOString()}`)
          continue
        }

        const txid   = randomUUID().replace(/-/g, '').slice(0, 35)
        const amount = Number(sub.amount)

        let pixData: { txid: string; pixCopyPaste: string; expiresAt: Date } | null = null
        try {
          pixData = await generatePixCharge({
            txid,
            amount,
            buyerName: clientName,
            description: `${sub.planName} — ${format(billingAt, 'MM/yyyy')}`,
            expiracaoSec: 3 * 24 * 60 * 60, // 3 dias
          })
        } catch (e) {
          console.error(`[BillingCron] PIX falhou para ${sub.id}:`, e)
          results.errors++
          results.detail.push(`[ERROR] PIX ${sub.id}: ${String(e)}`)
          continue
        }

        // Salva PIX gerado na assinatura
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            lastPixTxid:      pixData.txid,
            lastPixCopyPaste: pixData.pixCopyPaste,
            lastPixExpiresAt: pixData.expiresAt,
          },
        })

        // Envia via WhatsApp
        if (whatsapp) {
          const msg = pixBillingMessage({
            clientName,
            planName:  sub.planName,
            amount,
            currency:  sub.currency,
            pixCopy:   pixData.pixCopyPaste,
            dueDate:   billingAt,
            panelUrl:  `${panelBase}/dashboard/cliente/pagamento-pendente`,
          })
          await sendWhatsApp({ phone: whatsapp, message: msg })
            .catch((e) => console.error(`[BillingCron] WA falhou ${sub.id}:`, e))
        }

        // Envia por e-mail
        if (email) {
          sendEmail({
            to:      email,
            subject: `💳 Renovação de assinatura — ${sub.planName}`,
            html:    `<p>Olá, <strong>${clientName}</strong>!</p>
<p>Sua assinatura <strong>${sub.planName}</strong> vence em <strong>${format(billingAt, 'dd/MM/yyyy')}</strong>.</p>
<p><strong>PIX Copia e Cola:</strong></p>
<pre style="word-break:break-all;">${pixData.pixCopyPaste}</pre>
<p><a href="${panelBase}/dashboard/cliente/pagamento-pendente">Pagar pelo painel →</a></p>
<hr><p><em>${BRAND.name}</em></p>`,
          }).catch(() => {})
        }

        results.pixSent++
        results.detail.push(`[PIX] ${sub.id} — ${clientName} — ${format(billingAt, 'dd/MM')}`)
      }

      // ── CARD_PAGSMILE — cobra no vencimento ───────────────────────────────
      if (sub.paymentMethod === 'CARD_PAGSMILE') {
        // Só cobra se hoje é o dia do vencimento
        if (!isBefore(now, billingAt)) {
          if (!sub.cardToken) {
            results.detail.push(`[SKIP] ${sub.id} — sem cardToken`)
            continue
          }

          const outTradeNo = `${sub.id}-${format(now, 'yyyyMM')}`
          const amount     = Number(sub.amount)

          const charge = await chargeCardToken({
            outTradeNo,
            amountCents:      Math.round(amount * 100),
            currency:         sub.currency as 'BRL' | 'USD',
            cardToken:        sub.cardToken,
            cardHolder:       clientName,
            description:      `${sub.planName} — ${format(billingAt, 'MM/yyyy')}`,
            customerEmail:    email ?? `${sub.id}@adsativos.com`,
            customerDocument: '',
          })

          if (charge.ok) {
            results.cardCharged++
            results.detail.push(`[CARD] ${sub.id} — ${clientName} — tradeNo: ${charge.tradeNo}`)
            // Webhook da Pagsmile atualiza status e cria Transaction
          } else {
            const newRetry = (sub.retryCount ?? 0) + 1
            if (newRetry >= 3) {
              await prisma.subscription.update({
                where: { id: sub.id },
                data:  { status: 'PAST_DUE', retryCount: newRetry, lastBillingError: charge.error ?? 'Recusado' },
              })
              results.pastDue++
              results.detail.push(`[PAST_DUE] ${sub.id} — ${newRetry} tentativas`)
            } else {
              await prisma.subscription.update({
                where: { id: sub.id },
                data:  { retryCount: newRetry, lastBillingError: charge.error ?? 'Recusado' },
              })
              results.errors++
              results.detail.push(`[RETRY ${newRetry}] ${sub.id} — ${charge.error}`)
            }
          }
        }
      }
    } catch (err) {
      results.errors++
      results.detail.push(`[ERROR] ${sub.id}: ${String(err)}`)
      console.error(`[BillingCron] Erro inesperado ${sub.id}:`, err)
    }
  }

  return NextResponse.json({
    ok:   true,
    ran:  now.toISOString(),
    ...results,
  })
}
