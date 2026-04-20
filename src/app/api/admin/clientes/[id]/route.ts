import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  taxId: z.string().max(32).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  jobTitle: z.string().max(120).optional().nullable(),
  telegramUsername: z.string().max(64).optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
  adsPowerEmail: z.string().max(150).optional().nullable(),
  operationNiche: z.string().max(48).optional().nullable(),
  trustLevelStars: z.number().int().min(1).max(5).optional().nullable(),
  preferredCurrency: z.enum(['BRL', 'USD']).optional(),
  preferredPaymentMethod: z.string().max(32).optional().nullable(),
  accountManagerId: z.string().cuid().optional().nullable(),
  technicalSupportNotes: z.string().max(20000).optional().nullable(),
  clientStatus: z.string().max(20).optional(),
  leadAcquisitionSource: z.string().max(24).optional().nullable(),
  commercialNotes: z.string().max(20000).optional().nullable(),
  riskBlockCheckout: z.boolean().optional(),
  riskBlockReason: z.string().max(500).optional().nullable(),
})

/** Detalhe + edição estratégica do cliente (War Room / comercial). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL', 'FINANCE', 'DELIVERER'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const profile = await prisma.clientProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, phone: true, createdAt: true } },
      accountManager: { select: { id: true, name: true, email: true } },
    },
  })
  if (!profile) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const recentOrders = await prisma.order.findMany({
    where: { clientId: id },
    orderBy: { paidAt: 'desc' },
    take: 15,
    select: {
      id: true,
      product: true,
      value: true,
      currency: true,
      status: true,
      paidAt: true,
      orderSource: true,
      warrantyEndsAt: true,
      warrantyHours: true,
      paymentMethod: true,
      saleUseNiche: true,
      sellerId: true,
    },
  })

  return NextResponse.json({
    profile,
    recentOrders,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const exists = await prisma.clientProfile.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = patchSchema.parse(body)

    if (
      session.user?.role !== 'ADMIN' &&
      (data.riskBlockCheckout !== undefined || data.riskBlockReason !== undefined)
    ) {
      return NextResponse.json({ error: 'Só ADMIN altera bloqueio antifraude' }, { status: 403 })
    }

    if (data.accountManagerId) {
      const mgr = await prisma.user.findUnique({
        where: { id: data.accountManagerId },
        select: { role: true },
      })
      if (!mgr || !['ADMIN', 'COMMERCIAL', 'DELIVERER', 'MANAGER'].includes(mgr.role)) {
        return NextResponse.json({ error: 'Gestor inválido' }, { status: 400 })
      }
    }

    const updated = await prisma.clientProfile.update({
      where: { id },
      data: {
        ...(data.taxId !== undefined && { taxId: data.taxId }),
        ...(data.companyName !== undefined && { companyName: data.companyName }),
        ...(data.jobTitle !== undefined && { jobTitle: data.jobTitle }),
        ...(data.telegramUsername !== undefined && { telegramUsername: data.telegramUsername }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.adsPowerEmail !== undefined && { adsPowerEmail: data.adsPowerEmail }),
        ...(data.operationNiche !== undefined && { operationNiche: data.operationNiche }),
        ...(data.trustLevelStars !== undefined && { trustLevelStars: data.trustLevelStars }),
        ...(data.preferredCurrency !== undefined && { preferredCurrency: data.preferredCurrency }),
        ...(data.preferredPaymentMethod !== undefined && {
          preferredPaymentMethod: data.preferredPaymentMethod,
        }),
        ...(data.accountManagerId !== undefined && { accountManagerId: data.accountManagerId }),
        ...(data.technicalSupportNotes !== undefined && {
          technicalSupportNotes: data.technicalSupportNotes,
        }),
        ...(data.clientStatus !== undefined && { clientStatus: data.clientStatus }),
        ...(data.leadAcquisitionSource !== undefined && {
          leadAcquisitionSource: data.leadAcquisitionSource,
        }),
        ...(data.commercialNotes !== undefined && { commercialNotes: data.commercialNotes }),
        ...(data.riskBlockCheckout !== undefined && { riskBlockCheckout: data.riskBlockCheckout }),
        ...(data.riskBlockReason !== undefined && { riskBlockReason: data.riskBlockReason }),
      },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
        accountManager: { select: { id: true, name: true, email: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}
