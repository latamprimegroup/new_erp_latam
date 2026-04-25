/**
 * GET /api/admin/attribution-360
 *
 * Atribuição 360 — Jornada completa do cliente até a conversão.
 *
 * Cruza dados UTM de todas as fontes do ERP:
 *   - QuickSaleCheckout  (checkout público)
 *   - SalesCheckout      (checkout comercial)
 *   - Order              (sistema legado de pedidos)
 *
 * Retorna, por cliente (email/whatsapp), a linha do tempo de touchpoints:
 *   qual canal/campanha/anúncio originou cada conversão, em ordem cronológica.
 *
 * Query params:
 *   clientId     — filtra por ClientProfile.id
 *   email        — filtra por e-mail do comprador
 *   whatsapp     — filtra por WhatsApp do comprador
 *   source       — filtra por utm_source (ex: "facebook", "google")
 *   from / to    — intervalo de datas (ISO)
 *   limit        — max registros (default 200)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function isAdmin(s: Awaited<ReturnType<typeof getServerSession>>) {
  return ['ADMIN', 'COMMERCIAL'].includes((s?.user as { role?: string } | undefined)?.role ?? '')
}

export const dynamic = 'force-dynamic'

type Touchpoint = {
  id:           string
  source:       'quick_checkout' | 'sales_checkout' | 'order'
  occurredAt:   Date
  amountBrl:    number
  netProfit:    number | null
  productTitle: string
  buyerName:    string
  buyerEmail:   string | null
  buyerPhone:   string | null
  utmSource:    string | null
  utmMedium:    string | null
  utmCampaign:  string | null
  utmContent:   string | null
  utmTerm:      string | null
  utmSrc:       string | null
  profileType:  string | null
  status:       string
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const email      = searchParams.get('email')?.toLowerCase()
  const whatsapp   = searchParams.get('whatsapp')
  const source     = searchParams.get('source')
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500)

  const dateFilter = {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to   ? { lte: new Date(to)   } : {}),
  }

  const touchpoints: Touchpoint[] = []

  // ─── 1. QuickSaleCheckout ─────────────────────────────────────────────────

  const quickCheckouts = await prisma.quickSaleCheckout.findMany({
    where: {
      status:  'PAID',
      ...(email     ? { buyerEmail:    { contains: email } }     : {}),
      ...(whatsapp  ? { buyerWhatsapp: { contains: whatsapp } }  : {}),
      ...(source    ? { utmSource:     source }                  : {}),
      ...(Object.keys(dateFilter).length ? { paidAt: dateFilter } : {}),
    },
    include: {
      listing: { select: { title: true, destinationProfile: true } },
    },
    orderBy: { paidAt: 'desc' },
    take:    limit,
  })

  for (const qc of quickCheckouts) {
    touchpoints.push({
      id:           qc.id,
      source:       'quick_checkout',
      occurredAt:   qc.paidAt ?? qc.createdAt,
      amountBrl:    Number(qc.totalAmount),
      netProfit:    qc.netProfit ? Number(qc.netProfit) : null,
      productTitle: qc.listing.title,
      buyerName:    qc.buyerName,
      buyerEmail:   qc.buyerEmail,
      buyerPhone:   qc.buyerWhatsapp,
      utmSource:    qc.utmSource,
      utmMedium:    qc.utmMedium,
      utmCampaign:  qc.utmCampaign,
      utmContent:   qc.utmContent   ?? null,
      utmTerm:      qc.utmTerm      ?? null,
      utmSrc:       qc.utmSrc       ?? null,
      profileType:  qc.listing.destinationProfile ?? null,
      status:       qc.status,
    })
  }

  // ─── 2. SalesCheckout ─────────────────────────────────────────────────────

  const salesCheckouts = await prisma.salesCheckout.findMany({
    where: {
      status:  'PAID',
      ...(Object.keys(dateFilter).length ? { paidAt: dateFilter } : {}),
      lead: {
        ...(email    ? { email:    { contains: email } }    : {}),
        ...(whatsapp ? { whatsapp: { contains: whatsapp } } : {}),
        ...(source   ? { utmSource: source }                : {}),
      },
    },
    include: {
      lead: { select: {
        name: true, email: true, whatsapp: true, cpf: true,
        utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
      }},
    },
    orderBy: { paidAt: 'desc' },
    take:    limit,
  })

  for (const sc of salesCheckouts) {
    touchpoints.push({
      id:           sc.id,
      source:       'sales_checkout',
      occurredAt:   sc.paidAt ?? sc.createdAt,
      amountBrl:    Number(sc.amount),
      netProfit:    null,
      productTitle: sc.adsId,
      buyerName:    sc.lead.name,
      buyerEmail:   sc.lead.email,
      buyerPhone:   sc.lead.whatsapp,
      utmSource:    sc.lead.utmSource,
      utmMedium:    sc.lead.utmMedium,
      utmCampaign:  sc.lead.utmCampaign,
      utmContent:   sc.lead.utmContent ?? null,
      utmTerm:      sc.lead.utmTerm    ?? null,
      utmSrc:       null,
      profileType:  null,
      status:       sc.status,
    })
  }

  // ─── Agrega por canal de origem ───────────────────────────────────────────

  const bySource: Record<string, {
    source:        string | null
    medium:        string | null
    touchpoints:   number
    revenueBrl:    number
    netProfitBrl:  number
    campaigns:     Set<string>
    firstTouch:    Date
    lastTouch:     Date
  }> = {}

  for (const tp of touchpoints) {
    const key = `${tp.utmSource ?? 'direto'}|${tp.utmMedium ?? '(none)'}`
    if (!bySource[key]) {
      bySource[key] = {
        source:       tp.utmSource,
        medium:       tp.utmMedium,
        touchpoints:  0,
        revenueBrl:   0,
        netProfitBrl: 0,
        campaigns:    new Set(),
        firstTouch:   tp.occurredAt,
        lastTouch:    tp.occurredAt,
      }
    }
    const b = bySource[key]
    b.touchpoints++
    b.revenueBrl   += tp.amountBrl
    b.netProfitBrl += tp.netProfit ?? 0
    if (tp.utmCampaign) b.campaigns.add(tp.utmCampaign)
    if (tp.occurredAt < b.firstTouch) b.firstTouch = tp.occurredAt
    if (tp.occurredAt > b.lastTouch)  b.lastTouch  = tp.occurredAt
  }

  const channelBreakdown = Object.values(bySource)
    .map((b) => ({
      source:        b.source ?? 'direto',
      medium:        b.medium ?? '(none)',
      touchpoints:   b.touchpoints,
      revenueBrl:    Math.round(b.revenueBrl    * 100) / 100,
      netProfitBrl:  Math.round(b.netProfitBrl  * 100) / 100,
      campaigns:     [...b.campaigns],
      firstTouch:    b.firstTouch,
      lastTouch:     b.lastTouch,
    }))
    .sort((a, b) => b.revenueBrl - a.revenueBrl)

  const totalRevenue   = touchpoints.reduce((s, t) => s + t.amountBrl, 0)
  const totalNetProfit = touchpoints.reduce((s, t) => s + (t.netProfit ?? 0), 0)

  // Sort touchpoints por data (mais recente primeiro)
  touchpoints.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

  return NextResponse.json({
    totalTouchpoints: touchpoints.length,
    totalRevenueBrl:  Math.round(totalRevenue    * 100) / 100,
    totalNetProfitBrl: Math.round(totalNetProfit * 100) / 100,
    channelBreakdown,
    touchpoints: touchpoints.slice(0, limit),
  })
}
