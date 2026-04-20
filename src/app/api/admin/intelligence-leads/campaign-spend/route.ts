import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import { normalizeUtmCampaign, normalizeUtmSource } from '@/lib/intelligence-utm-normalize'

const ROLES = ['ADMIN', 'FINANCE'] as const

const postSchema = z.object({
  utm_source: z.string().max(120).optional(),
  utmSource: z.string().max(120).optional(),
  utm_campaign: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  period_month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  spend_brl: z.union([z.number(), z.string()]),
  notes: z.string().max(500).optional(),
})

function parseMonth(s: string): Date {
  const parts = s.slice(0, 7).split('-').map(Number)
  const y = parts[0]!
  const m = parts[1]!
  return new Date(Date.UTC(y, m - 1, 1))
}

/**
 * GET — lista gastos registrados (últimos 24 meses por defeito)
 * POST — upsert gasto por UTM + mês (motor de lucro real)
 */
export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '120', 10) || 120)

  const rows = await prisma.intelligenceCampaignSpend.findMany({
    orderBy: [{ periodMonth: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  })

  return NextResponse.json({
    count: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      utm_source: r.utmSource,
      utm_campaign: r.utmCampaign,
      period_month: r.periodMonth.toISOString().slice(0, 10),
      spend_brl: Number(r.spendBrl),
      notes: r.notes,
      updatedAt: r.updatedAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido (period_month YYYY-MM, spend_brl)' }, { status: 400 })
  }

  const src = normalizeUtmSource(body.utm_source ?? body.utmSource ?? null)
  const camp = normalizeUtmCampaign(body.utm_campaign ?? body.utmCampaign ?? null)
  const periodMonth = parseMonth(body.period_month)
  const spend =
    typeof body.spend_brl === 'number' ? body.spend_brl : Number(String(body.spend_brl).replace(',', '.'))
  if (!Number.isFinite(spend) || spend < 0) {
    return NextResponse.json({ error: 'spend_brl inválido' }, { status: 400 })
  }

  const row = await prisma.intelligenceCampaignSpend.upsert({
    where: {
      utmSource_utmCampaign_periodMonth: {
        utmSource: src,
        utmCampaign: camp,
        periodMonth,
      },
    },
    create: {
      utmSource: src,
      utmCampaign: camp,
      periodMonth,
      spendBrl: Math.round(spend * 100) / 100,
      notes: body.notes?.trim() || null,
    },
    update: {
      spendBrl: Math.round(spend * 100) / 100,
      notes: body.notes?.trim() || null,
    },
  })

  return NextResponse.json({
    ok: true,
    row: {
      id: row.id,
      utm_source: row.utmSource,
      utm_campaign: row.utmCampaign,
      period_month: row.periodMonth.toISOString().slice(0, 10),
      spend_brl: Number(row.spendBrl),
    },
  })
}
