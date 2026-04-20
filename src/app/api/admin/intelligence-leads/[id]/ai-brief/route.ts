import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import { refreshLeadCommercialAiBrief } from '@/lib/intelligence-lead-ai-brief'
import { logCommercialDataAudit } from '@/lib/commercial-audit-log'

const ROLES = ['ADMIN', 'COMMERCIAL', 'FINANCE'] as const

/** POST — regerar resumo IA (triagem virtual) */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const userId = auth.session.user.id
  const role = auth.session.user.role

  const lead = await prisma.intelligenceLead.findUnique({
    where: { id },
    select: { id: true, assignedCommercialId: true },
  })
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (role === 'COMMERCIAL' && lead.assignedCommercialId !== userId) {
    return NextResponse.json({ error: 'Lead não atribuído a si' }, { status: 403 })
  }

  await refreshLeadCommercialAiBrief(id)
  const updated = await prisma.intelligenceLead.findUnique({
    where: { id },
    select: { commercialAiBrief: true },
  })

  await logCommercialDataAudit({
    userId,
    role,
    action: 'REGENERATE_LEAD_AI_BRIEF',
    entityType: 'INTELLIGENCE_LEAD',
    entityId: id,
  })

  return NextResponse.json({
    ok: true,
    commercialAiBrief: updated?.commercialAiBrief ?? null,
  })
}
