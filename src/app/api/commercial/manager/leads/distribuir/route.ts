import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCommercialManagerAccess } from '@/lib/commercial-hierarchy'

const bodySchema = z.object({
  leadId: z.string().min(1),
  sellerId: z.string().min(1),
})

export async function PATCH(req: NextRequest) {
  const access = await requireCommercialManagerAccess()
  if (!access.ok) return access.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' }, { status: 422 })
  }

  const { leadId, sellerId } = parsed.data
  const managerId = access.session.user.id

  const sellerWhere =
    access.session.user.role === 'ADMIN'
      ? { id: sellerId, role: 'COMMERCIAL' as const }
      : {
          id: sellerId,
          role: 'COMMERCIAL' as const,
          OR: [{ leaderId: managerId }, { id: managerId }],
        }

  const seller = await prisma.user.findFirst({
    where: sellerWhere,
    select: { id: true, name: true, email: true },
  })
  if (!seller) {
    return NextResponse.json({ error: 'Vendedor não pertence ao seu time' }, { status: 403 })
  }

  const lead = await prisma.commercialLead.findUnique({
    where: { id: leadId },
    select: { id: true, assignedCommercialId: true, name: true, email: true },
  })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const updated = await prisma.commercialLead.update({
    where: { id: leadId },
    data: { assignedCommercialId: seller.id },
    select: {
      id: true,
      name: true,
      email: true,
      funnelStep: true,
      assignedCommercialId: true,
      assignedCommercial: { select: { id: true, name: true, email: true } },
      updatedAt: true,
    },
  })

  await prisma.commercialDataAuditLog.create({
    data: {
      userId: managerId,
      role: access.session.user.role || 'COMMERCIAL',
      action: 'LEAD_ASSIGNMENT_MANAGER',
      entityType: 'CommercialLead',
      entityId: leadId,
      metadata: {
        fromSellerId: lead.assignedCommercialId,
        toSellerId: seller.id,
        leadName: lead.name,
        leadEmail: lead.email,
      } as never,
    },
  }).catch((e) => console.error('[LeadDistribuicao] audit error', e))

  return NextResponse.json(updated)
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const access = await requireCommercialManagerAccess()
    if (!access.ok) return access.response

    const managerId = access.session.user.id
    const where =
      access.session.user.role === 'ADMIN'
        ? { role: 'COMMERCIAL' as const }
        : {
            role: 'COMMERCIAL' as const,
            OR: [{ leaderId: managerId }, { id: managerId }],
          }

    const sellers = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      sellers: sellers.map((s) => ({
        id: s.id,
        name: s.name || s.email,
        email: s.email,
      })),
    })
  } catch (err) {
    console.error('[manager/leads/distribuir GET] Erro:', err)
    return NextResponse.json({ sellers: [] }, { status: 500 })
  }
}

