import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import { customerHealthBand } from '@/lib/intelligence-leads-engine'
import { suggestUpsellSlugs } from '@/lib/intelligence-leads-upsell'
import { generateLeadWhatsAppScript } from '@/lib/intelligence-lead-sales-script'
import { logCommercialDataAudit } from '@/lib/commercial-audit-log'

const ROLES = ['ADMIN', 'COMMERCIAL', 'FINANCE'] as const

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const userId = auth.session.user.id
  const role = auth.session.user.role

  const lead = await prisma.intelligenceLead.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      assignedCommercialId: true,
      totalSales: true,
      purchaseCount: true,
      lastProductName: true,
      lastPurchaseAt: true,
      lastInteractionAt: true,
      createdAt: true,
      behaviorTags: true,
      purchasedProductSlugs: true,
    },
  })

  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (role === 'COMMERCIAL' && lead.assignedCommercialId !== userId) {
    return NextResponse.json({ error: 'Lead não atribuído a si' }, { status: 403 })
  }

  const health = customerHealthBand({
    lastPurchaseAt: lead.lastPurchaseAt,
    lastInteractionAt: lead.lastInteractionAt,
    createdAt: lead.createdAt,
  })
  const upsellSuggestions = suggestUpsellSlugs(lead.purchasedProductSlugs)

  let daysSincePurchase: number | null = null
  if (lead.lastPurchaseAt) {
    daysSincePurchase = Math.floor((Date.now() - lead.lastPurchaseAt.getTime()) / 86400000)
  }

  const text = await generateLeadWhatsAppScript({
    name: lead.name,
    email: lead.email,
    totalSales: Number(lead.totalSales),
    purchaseCount: lead.purchaseCount,
    lastProductName: lead.lastProductName,
    daysSincePurchase,
    behaviorTags: lead.behaviorTags,
    customerHealth: health,
    upsellSuggestions,
  })

  void logCommercialDataAudit({
    userId,
    role,
    action: 'GENERATE_LEAD_AI_SCRIPT',
    entityType: 'INTELLIGENCE_LEAD',
    entityId: id,
  })

  return NextResponse.json({
    ok: true,
    message: text,
    context: {
      customerHealth: health,
      upsellSuggestions,
      anthropicConfigured: !!process.env.ANTHROPIC_API_KEY?.trim(),
    },
  })
}
