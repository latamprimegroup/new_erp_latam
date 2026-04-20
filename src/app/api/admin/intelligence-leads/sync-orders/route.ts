import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import { syncIntelligenceLeadFromOrders } from '@/lib/intelligence-leads-engine'

const ROLES = ['ADMIN', 'FINANCE'] as const

const bodySchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
})

/**
 * POST /api/admin/intelligence-leads/sync-orders
 * Recalcula LTV / purchaseCount / timeline de pedidos para N leads (batch).
 */
export async function POST(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  let limit = 80
  try {
    const j = await req.json().catch(() => ({}))
    const p = bodySchema.safeParse(j)
    if (p.success && p.data.limit) limit = p.data.limit
  } catch {
    /* body vazio */
  }

  const leads = await prisma.intelligenceLead.findMany({
    select: { id: true, email: true },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  })

  let ok = 0
  let fail = 0
  for (const l of leads) {
    try {
      await syncIntelligenceLeadFromOrders(l.id)
      ok++
    } catch {
      fail++
    }
  }

  return NextResponse.json({
    ok: true,
    processed: leads.length,
    syncedOk: ok,
    syncFailed: fail,
    hint: 'Agende cron com POST + cookie de sessão ADMIN ou chame manualmente após picos de vendas.',
  })
}
