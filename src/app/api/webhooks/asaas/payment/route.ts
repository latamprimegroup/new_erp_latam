/**
 * Webhook Asaas (estrutura genérica). Marca pedido PAID se externalReference = order:{id}
 * ou payment.externalReference contiver o id do pedido.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCommercialOrderPaidBridge } from '@/lib/commercial-order-bridge'
import { computeWarrantyEndsAt } from '@/lib/order-warranty'
import { syncClientLTV } from '@/lib/client-ltv'
import { notifyAdminsSaleCompleted } from '@/lib/notifications/admin-events'

export const runtime = 'nodejs'

function extractCuid(s: string): string | null {
  const m = s.match(/\b(c[a-z0-9]{24,})\b/i)
  return m ? m[0] : null
}

function findOrderId(obj: unknown): string | null {
  if (obj == null) return null
  if (typeof obj === 'string') {
    const c = extractCuid(obj)
    if (c) return c
    const m = obj.match(/order[:_#\s]+(c[a-z0-9]{24,})/i)
    return m ? m[1] : null
  }
  if (typeof obj === 'object') {
    const r = obj as Record<string, unknown>
    const keys = ['externalReference', 'orderId', 'order_id', 'description']
    for (const k of keys) {
      const v = r[k]
      if (typeof v === 'string') {
        const id = findOrderId(v)
        if (id) return id
      }
    }
    for (const v of Object.values(r)) {
      const found = findOrderId(v)
      if (found) return found
    }
  }
  return null
}

function isPaidLike(obj: unknown): boolean {
  if (typeof obj !== 'object' || !obj) return false
  const r = obj as Record<string, unknown>
  const status = String(r.status || r.paymentStatus || '').toUpperCase()
  if (['CONFIRMED', 'RECEIVED', 'PAID', 'APPROVED'].some((s) => status.includes(s))) return true
  return r.confirmed === true || r.received === true
}

export async function POST(req: NextRequest) {
  const secret = process.env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (secret) {
    const h = req.headers.get('asaas-access-token') || req.headers.get('x-asaas-token')
    if (h !== secret) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!isPaidLike(payload) && typeof payload === 'object' && payload && 'payment' in payload) {
    if (!isPaidLike((payload as { payment: unknown }).payment)) {
      return NextResponse.json({ ok: true, ignored: true })
    }
  } else if (!isPaidLike(payload)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const orderId = findOrderId(payload)
  if (!orderId) return NextResponse.json({ ok: true, orderId: null })

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, warrantyHours: true },
  })
  if (!order || order.status === 'PAID' || order.status === 'DELIVERED') {
    return NextResponse.json({ ok: true, orderId, updated: false })
  }

  const paidAt = new Date()
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'PAID',
      paidAt,
      warrantyEndsAt: computeWarrantyEndsAt(paidAt, order.warrantyHours ?? 48),
    },
  })

  const fullOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { account: true } },
      client: { include: { user: { select: { name: true } } } },
    },
  })
  if (fullOrder?.clientId) {
    syncClientLTV(fullOrder.clientId).catch((e) => console.error('syncClientLTV asaas', e))
  }
  if (fullOrder) {
    const items = fullOrder.items || []
    const platforms = items.map((i) => i.account?.platform).filter(Boolean) as string[]
    notifyAdminsSaleCompleted(
      orderId,
      fullOrder.client?.user?.name ?? null,
      items.length,
      platforms
    ).catch((e) => console.error('notify sale asaas', e))
  }
  runCommercialOrderPaidBridge(orderId, 'webhook_asaas').catch((e) => console.error('bridge asaas', e))

  return NextResponse.json({ ok: true, orderId, updated: true })
}
