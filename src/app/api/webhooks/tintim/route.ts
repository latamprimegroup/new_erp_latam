import { NextRequest, NextResponse } from 'next/server'
import {
  verifyTintimSecret,
  isTintimSalePayload,
  processTintimSaleWebhook,
  processTintimLeadWebhook,
} from '@/lib/tintim-bridge'

/**
 * Webhook Tintim (legado) — mesmo comportamento que POST /api/v1/webhooks/tintim
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/webhooks/tintim',
    preferred: 'POST /api/v1/webhooks/tintim',
    hint: 'Venda aprovada: use customer_name, customer_email, customer_phone, product_id, value.',
    secretConfigured: !!process.env.TINTIM_WEBHOOK_SECRET?.trim(),
    links: {
      roiCrmDashboard: '/dashboard/roi-crm',
      adminIntegracoes: '/dashboard/admin/integracoes',
    },
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
