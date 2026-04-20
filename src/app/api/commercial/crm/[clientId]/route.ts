import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const patchSchema = z.object({
  commercialNotes: z.string().max(8000).optional().nullable(),
  lastContactDate: z.string().datetime().optional().nullable(),
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
  accountManagerId: z.string().optional().nullable(),
  technicalSupportNotes: z.string().max(8000).optional().nullable(),
  clientStatus: z.string().max(24).optional(),
  leadAcquisitionSource: z.string().max(24).optional().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { clientId } = await params
  try {
    const body = patchSchema.parse(await req.json())
    const exists = await prisma.clientProfile.findUnique({ where: { id: clientId } })
    if (!exists) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const updated = await prisma.clientProfile.update({
      where: { id: clientId },
      data: {
        ...(body.commercialNotes !== undefined && { commercialNotes: body.commercialNotes }),
        ...(body.lastContactDate !== undefined && {
          lastContactDate: body.lastContactDate ? new Date(body.lastContactDate) : null,
        }),
        ...(body.taxId !== undefined && { taxId: body.taxId }),
        ...(body.companyName !== undefined && { companyName: body.companyName }),
        ...(body.jobTitle !== undefined && { jobTitle: body.jobTitle }),
        ...(body.telegramUsername !== undefined && { telegramUsername: body.telegramUsername }),
        ...(body.timezone !== undefined && { timezone: body.timezone }),
        ...(body.adsPowerEmail !== undefined && { adsPowerEmail: body.adsPowerEmail }),
        ...(body.operationNiche !== undefined && { operationNiche: body.operationNiche }),
        ...(body.trustLevelStars !== undefined && { trustLevelStars: body.trustLevelStars }),
        ...(body.preferredCurrency !== undefined && { preferredCurrency: body.preferredCurrency }),
        ...(body.preferredPaymentMethod !== undefined && {
          preferredPaymentMethod: body.preferredPaymentMethod,
        }),
        ...(body.accountManagerId !== undefined && { accountManagerId: body.accountManagerId }),
        ...(body.technicalSupportNotes !== undefined && {
          technicalSupportNotes: body.technicalSupportNotes,
        }),
        ...(body.clientStatus !== undefined && { clientStatus: body.clientStatus }),
        ...(body.leadAcquisitionSource !== undefined && {
          leadAcquisitionSource: body.leadAcquisitionSource,
        }),
      },
    })

    await audit({
      userId: session.user?.id,
      action: 'commercial_crm_client_updated',
      entity: 'ClientProfile',
      entityId: clientId,
      details: { fields: Object.keys(body) },
    })

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
