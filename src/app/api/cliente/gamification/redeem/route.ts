import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/notifications/channels/email'
import { computeGamificationLifetimeTotals, GAMIFICATION_REWARD_DEFS } from '@/lib/cliente/gamification'

const shippingSchema = z.object({
  fullName: z.string().min(3).max(200),
  phone: z.string().min(8).max(40),
  line1: z.string().min(3).max(300),
  line2: z.string().max(200).optional(),
  neighborhood: z.string().max(120).optional(),
  city: z.string().min(2).max(120),
  stateUf: z.string().min(2).max(8),
  postalCode: z.string().min(4).max(16),
  country: z.string().min(2).max(8).default('BR'),
})

const bodySchema = z.object({
  rewardKey: z.string().min(2).max(80),
  shipping: shippingSchema,
})

async function postRedeemWebhook(payload: Record<string, unknown>): Promise<boolean> {
  const url = process.env.GAMIFICATION_REDEEM_WEBHOOK_URL?.trim()
  if (!url) return false
  const secret = process.env.GAMIFICATION_REDEEM_WEBHOOK_SECRET?.trim()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (secret) headers['X-Gamification-Secret'] = secret
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'gamification_redeem', ...payload }),
    })
    return r.ok
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido — preenche o endereço completo.' }, { status: 400 })
  }

  const def = GAMIFICATION_REWARD_DEFS.find((d) => d.key === body.rewardKey)
  if (!def) return NextResponse.json({ error: 'Recompensa desconhecida' }, { status: 404 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true, clientCode: true, user: { select: { email: true, name: true } } },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { netProfit } = await computeGamificationLifetimeTotals(client.id)
  if (netProfit < def.minNetProfitBrl) {
    return NextResponse.json({ error: 'Marco ainda não atingido' }, { status: 403 })
  }

  const existing = await prisma.clientGamificationRedemption.findFirst({
    where: { clientId: client.id, rewardKey: def.key },
  })
  if (existing) {
    return NextResponse.json({ error: 'Resgate já pedido' }, { status: 409 })
  }

  const shippingPayload = body.shipping

  await prisma.clientGamificationRedemption.create({
    data: {
      clientId: client.id,
      rewardKey: def.key,
      shippingPayload: shippingPayload as object,
    },
  })

  const inbox =
    process.env.GAMIFICATION_REWARDS_NOTIFY_EMAIL?.trim() ||
    process.env.COMMERCIAL_REWARDS_INBOX?.trim() ||
    ''

  let emailOk = false
  if (inbox) {
    const subject = `[Arsenal] Resgate físico — ${def.key} — ${client.clientCode || client.id.slice(0, 8)}`
    const html = [
      `<p><b>Cliente:</b> ${client.user?.name || '—'} (${client.user?.email || '—'})</p>`,
      `<p><b>Código:</b> ${client.clientCode || client.id}</p>`,
      `<p><b>Recompensa:</b> ${def.key}</p>`,
      `<p><b>Lucro líquido acumulado (ref.):</b> ${netProfit.toFixed(2)} BRL</p>`,
      `<p><b>Morada / envio:</b></p>`,
      `<pre style="font-family:monospace;font-size:12px">${JSON.stringify(shippingPayload, null, 2)}</pre>`,
      `<p>Logística (Francielle): preparar envio.</p>`,
    ].join('')
    emailOk = await sendEmail({ to: inbox, subject, html })
  }

  const webhookOk = await postRedeemWebhook({
    clientId: client.id,
    clientCode: client.clientCode,
    userEmail: client.user?.email,
    rewardKey: def.key,
    netProfitBrl: netProfit,
    shipping: shippingPayload,
  })

  return NextResponse.json({
    ok: true,
    emailSent: emailOk,
    emailConfigured: Boolean(inbox),
    webhookSent: webhookOk,
    webhookConfigured: Boolean(process.env.GAMIFICATION_REDEEM_WEBHOOK_URL?.trim()),
  })
}
