import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { verifyCheckoutPulseSecret } from '@/lib/checkout-pulse-auth'

const bodySchema = z.object({
  provider: z.string().min(1).max(32),
  event: z.enum(['APPROVED', 'PENDING', 'FAILED', 'WEBHOOK', 'ANY']).optional(),
})

/**
 * POST /api/v1/checkout/pulse — multi-checkout (Appmax, Hotmart, Stripe…)
 * Auth: Bearer ou X-Checkout-Pulse-Token = ECOSYSTEM_CHECKOUT_PULSE_SECRET
 */
export async function GET() {
  const ok = !!process.env.ECOSYSTEM_CHECKOUT_PULSE_SECRET?.trim()
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/v1/checkout/pulse',
    secretConfigured: ok,
    body: { provider: 'APPMAX|HOTMART|STRIPE|...', event: 'APPROVED|PENDING|FAILED|WEBHOOK|ANY' },
  })
}

export async function POST(req: NextRequest) {
  if (!verifyCheckoutPulseSecret(req)) {
    return NextResponse.json(
      {
        error: process.env.ECOSYSTEM_CHECKOUT_PULSE_SECRET?.trim()
          ? 'Token inválido'
          : 'Defina ECOSYSTEM_CHECKOUT_PULSE_SECRET',
      },
      { status: 401 },
    )
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'provider obrigatório' }, { status: 400 })
  }

  const code = parsed.data.provider.trim().toUpperCase().slice(0, 32)
  const ev = parsed.data.event ?? 'WEBHOOK'
  const now = new Date()

  const label =
    {
      APPMAX: 'Appmax',
      HOTMART: 'Hotmart',
      STRIPE: 'Stripe',
      KIWIFY: 'Kiwify',
      ERP_PIX: 'PIX / ERP interno',
    }[code] || code

  const row = await prisma.checkoutGatewayPulse.upsert({
    where: { code },
    create: {
      code,
      label,
      lastWebhookAt: now,
      lastApprovedAt: ev === 'APPROVED' ? now : null,
      enabled: true,
    },
    update: {
      label,
      lastWebhookAt: now,
      ...(ev === 'APPROVED' ? { lastApprovedAt: now } : {}),
    },
  })

  return NextResponse.json({
    ok: true,
    code: row.code,
    lastWebhookAt: row.lastWebhookAt?.toISOString() ?? null,
    lastApprovedAt: row.lastApprovedAt?.toISOString() ?? null,
  })
}
