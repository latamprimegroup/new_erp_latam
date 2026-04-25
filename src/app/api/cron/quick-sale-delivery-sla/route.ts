import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyQuickSaleDeliverySlaRisk } from '@/lib/notifications/admin-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET
const DELIVERY_SLA_MINUTES = Number(process.env.QUICK_SALE_DELIVERY_SLA_MINUTES ?? 60)
const ALERT_THROTTLE_MINUTES = Number(process.env.QUICK_SALE_DELIVERY_ALERT_THROTTLE_MINUTES ?? 30)

function toDateMinusMinutes(minutes: number) {
  return new Date(Date.now() - Math.max(1, minutes) * 60 * 1000)
}

function getAlertKey(checkoutId: string) {
  return `quick_sale_delivery_sla_alert:${checkoutId}`
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slaCutoff = toDateMinusMinutes(DELIVERY_SLA_MINUTES)
  const throttleCutoff = toDateMinusMinutes(ALERT_THROTTLE_MINUTES)

  const stalled = await prisma.quickSaleCheckout.findMany({
    where: {
      status: 'PAID',
      deliverySent: false,
      deliveryFlowStatus: { in: ['WAITING_CUSTOMER_DATA', 'DELIVERY_REQUESTED', 'DELIVERY_IN_PROGRESS'] },
      paidAt: { not: null, lt: slaCutoff },
    },
    select: {
      id: true,
      paidAt: true,
      buyerName: true,
      buyerWhatsapp: true,
      listing: { select: { title: true, slug: true } },
      deliveryFlowStatus: true,
    },
    orderBy: { paidAt: 'asc' },
    take: 50,
  })

  let alertsSent = 0
  const now = new Date()
  const orderRefKeys = stalled.map((checkout) => `quick_sale_order_ref:${checkout.id}`)
  const orderRefs = orderRefKeys.length > 0
    ? await prisma.systemSetting.findMany({
        where: { key: { in: orderRefKeys } },
        select: { key: true, value: true },
      })
    : []
  const orderNumberByCheckoutId = new Map<string, string>()
  for (const ref of orderRefs) {
    if (!ref.key.startsWith('quick_sale_order_ref:')) continue
    const checkoutId = ref.key.replace('quick_sale_order_ref:', '')
    const orderNumber = ref.value?.trim()
    if (!checkoutId || !orderNumber) continue
    orderNumberByCheckoutId.set(checkoutId, orderNumber)
  }

  for (const checkout of stalled) {
    const key = getAlertKey(checkout.id)
    const previous = await prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    })

    if (previous?.value) {
      const lastAlertAt = new Date(previous.value)
      if (!Number.isNaN(lastAlertAt.getTime()) && lastAlertAt > throttleCutoff) {
        continue
      }
    }

    const paidAt = checkout.paidAt ? new Date(checkout.paidAt) : null
    if (!paidAt || Number.isNaN(paidAt.getTime())) continue
    const minutesWaiting = Math.max(1, Math.floor((now.getTime() - paidAt.getTime()) / 60_000))
    const orderNumber = orderNumberByCheckoutId.get(checkout.id) ?? null

    await notifyQuickSaleDeliverySlaRisk({
      checkoutId: checkout.id,
      orderNumber,
      buyerName: checkout.buyerName,
      buyerWhatsapp: checkout.buyerWhatsapp,
      listingTitle: checkout.listing.title,
      minutesWaiting,
      flowStatus: checkout.deliveryFlowStatus,
      checkoutUrl: `/loja/${checkout.listing.slug}?checkoutId=${encodeURIComponent(checkout.id)}`,
    }).catch((e: unknown) => console.error('[cron/quick-sale-delivery-sla] notify', e))

    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: now.toISOString() },
      update: { value: now.toISOString() },
    })

    alertsSent += 1
  }

  return NextResponse.json({
    ok: true,
    scanned: stalled.length,
    alertsSent,
    slaMinutes: DELIVERY_SLA_MINUTES,
    ranAt: now.toISOString(),
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
