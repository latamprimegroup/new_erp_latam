import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveCampaignAttributionLabel } from '@/lib/roi-crm-queries'

const ROLES = ['ADMIN', 'COMMERCIAL', 'FINANCE']

const PAID_LIKE = ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] as const

const patchSchema = z.object({
  clientId: z.string().min(1),
  roiCrmStatus: z.enum(['ATIVO', 'INATIVO', 'VIP']),
})

/**
 * Lista clientes com origem atribuída, status CRM e histórico de pedidos (fechamentos).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '80', 10) || 80))
  const crmRaw = searchParams.get('crmStatus')?.trim().toUpperCase() ?? ''
  const crmStatus =
    crmRaw === 'ATIVO' || crmRaw === 'INATIVO' || crmRaw === 'VIP' ? crmRaw : null

  const clauses: Prisma.ClientProfileWhereInput[] = []
  if (q.length > 0) {
    const codeOr: Prisma.ClientProfileWhereInput[] = []
    if (/^C\d+$/i.test(q)) {
      codeOr.push({ clientCode: { equals: q.toUpperCase() } })
    }
    clauses.push({
      OR: [
        ...codeOr,
        { user: { name: { contains: q } } },
        { user: { email: { contains: q } } },
        { whatsapp: { contains: q } },
        { roiAttributionCampaign: { contains: q } },
      ],
    })
  }
  if (crmStatus) {
    clauses.push({ roiCrmStatus: crmStatus })
  }

  const where: Prisma.ClientProfileWhereInput =
    clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0]! : { AND: clauses }

  const clients = await prisma.clientProfile.findMany({
    where,
    take: limit,
    orderBy: [{ lastPurchaseAt: 'desc' }, { user: { name: 'asc' } }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      tintimLeadEvents: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { utmSource: true, utmCampaign: true, campaignName: true },
      },
      orders: {
        where: { status: { in: [...PAID_LIKE] } },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          value: true,
          status: true,
          paidAt: true,
          createdAt: true,
          product: true,
        },
      },
    },
  })

  return NextResponse.json(
    {
      clients: clients.map((c) => {
        const lead = c.tintimLeadEvents[0] ?? null
        const utmSource = lead?.utmSource?.trim() || null
        const utmCampaign = lead?.utmCampaign?.trim() || null
        const campanha = resolveCampaignAttributionLabel(c.roiAttributionCampaign, lead)
        const origem =
          utmSource && utmCampaign
            ? `${utmSource} · ${utmCampaign}`
            : utmSource || utmCampaign || campanha || '—'
        return {
        id: c.id,
        clientCode: c.clientCode,
        nome: c.user.name || c.user.email || 'Cliente',
        email: c.user.email,
        whatsapp: c.whatsapp,
        contato: c.whatsapp || c.user.email || '—',
        utmSource,
        utmCampaign,
        origem,
        status: c.roiCrmStatus,
        ltv: c.totalSpent != null ? Number(c.totalSpent) : null,
        lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
        pedidos: c.orders.map((o) => ({
          id: o.id,
          valor: Number(o.value),
          status: o.status,
          pagoEm: o.paidAt?.toISOString() ?? null,
          criadoEm: o.createdAt.toISOString(),
          produto: o.product,
        })),
        }
      }),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = patchSchema.parse(await req.json())
    await prisma.clientProfile.update({
      where: { id: body.clientId },
      data: { roiCrmStatus: body.roiCrmStatus },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message }, { status: 400 })
    }
    throw e
  }
}
