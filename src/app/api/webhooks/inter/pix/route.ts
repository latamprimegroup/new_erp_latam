/**
 * Callback PIX Banco Inter (estrutura genérica — ajuste o parser ao payload real da integração).
 * Atualiza pedido para PAID quando encontrar interPixTxid correspondente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCommercialOrderPaidBridge } from '@/lib/commercial-order-bridge'
import { computeWarrantyEndsAt } from '@/lib/order-warranty'
import { syncClientLTV } from '@/lib/client-ltv'
import { notifyAdminsSaleCompleted } from '@/lib/notifications/admin-events'

export const runtime = 'nodejs'

function collectTxids(obj: unknown, out: Set<string>) {
  if (obj == null) return
  if (typeof obj === 'string' && /[a-z0-9-]{10,}/i.test(obj)) {
    const s = obj.trim()
    if (s.length >= 10 && s.length <= 120) out.add(s)
  }
  if (Array.isArray(obj)) {
    for (const x of obj) collectTxids(x, out)
    return
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (/txid|endToEnd|e2e/i.test(k) && typeof v === 'string') out.add(v.trim())
      collectTxids(v, out)
    }
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.INTER_PIX_WEBHOOK_SECRET?.trim()
  if (secret && req.headers.get('x-inter-webhook-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const txids = new Set<string>()
  collectTxids(payload, txids)

  let updated = 0
  for (const txid of txids) {
    const order = await prisma.order.findFirst({
      where: { interPixTxid: txid },
      select: { id: true, status: true, warrantyHours: true },
    })
    if (!order || order.status === 'PAID' || order.status === 'DELIVERED') continue
    const paidAt = new Date()
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paidAt,
        warrantyEndsAt: computeWarrantyEndsAt(paidAt, order.warrantyHours ?? 48),
      },
    })
    updated += 1

    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: { include: { account: true } },
        client: { include: { user: { select: { name: true } } } },
      },
    })
    if (fullOrder?.clientId) {
      syncClientLTV(fullOrder.clientId).catch((e) => console.error('syncClientLTV inter', e))
    }
    if (fullOrder) {
      const items = fullOrder.items || []
      const platforms = items.map((i) => i.account?.platform).filter(Boolean) as string[]
      notifyAdminsSaleCompleted(
        order.id,
        fullOrder.client?.user?.name ?? null,
        items.length,
        platforms
      ).catch((e) => console.error('notify sale inter', e))
    }
    runCommercialOrderPaidBridge(order.id, 'webhook_inter').catch((e) =>
      console.error('commercial bridge inter', e)
    )
  }

  return NextResponse.json({ ok: true, txidsFound: txids.size, ordersMarkedPaid: updated })
}
