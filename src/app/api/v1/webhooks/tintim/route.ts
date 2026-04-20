import { NextRequest, NextResponse } from 'next/server'
import {
  verifyTintimSecret,
  isTintimSalePayload,
  processTintimSaleWebhook,
  processTintimLeadWebhook,
} from '@/lib/tintim-bridge'

/**
 * Webhook Tintim v1 — vendas (onboarding automático) e leads (UTM / campanha).
 * POST /api/v1/webhooks/tintim
 * Segurança: Authorization: Bearer &lt;TINTIM_WEBHOOK_SECRET&gt; ou X-Tintim-Secret
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/v1/webhooks/tintim',
    legacy: 'POST /api/webhooks/tintim',
    hint: 'Venda: event venda_aprovada + customer_*, product_id, value. Lead: phone/email + UTM.',
    secretConfigured: !!process.env.TINTIM_WEBHOOK_SECRET?.trim(),
    productMap: 'Defina TINTIM_PRODUCT_MAP_JSON para mapear product_id → produto, accountType, quantity.',
  })
}

export async function POST(req: NextRequest) {
  if (!verifyTintimSecret(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (isTintimSalePayload(body)) {
    const r = await processTintimSaleWebhook(body)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }

  try {
    const r = await processTintimLeadWebhook(body)
    return NextResponse.json(r)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
