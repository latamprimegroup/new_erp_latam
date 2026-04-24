import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isCommercialManager } from '@/lib/commercial-hierarchy'

const FUNNEL_STEPS = [
  'STEP_1_CAPTURA',
  'STEP_2_WHATSAPP',
  'STEP_3_FOTO',
  'STEP_4_VALIDACAO',
  'STEP_5_QUALIFICACAO',
  'STEP_6_PROPOSTA',
  'STEP_7_CONVERSAO',
] as const

const patchSchema = z.object({
  funnelStep: z.enum(FUNNEL_STEPS).optional(),
  photoPath: z.string().optional().nullable(),
  validatedAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  convertedClientId: z.string().optional().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!['ADMIN', 'COMMERCIAL'].includes(session.user?.role || '')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  if (session.user.role === 'COMMERCIAL' && !isCommercialManager(session.user)) {
    const ownLead = await prisma.commercialLead.findUnique({
      where: { id: (await params).id },
      select: { assignedCommercialId: true },
    })
    if (!ownLead || ownLead.assignedCommercialId !== session.user.id) {
      return NextResponse.json({ error: 'Sem permissão para editar lead de outro vendedor' }, { status: 403 })
    }
  }

  const { id } = await params
  try {
    const parsed = patchSchema.parse(await req.json())
    const data: Prisma.CommercialLeadUncheckedUpdateInput = {}
    if (parsed.funnelStep !== undefined) data.funnelStep = parsed.funnelStep
    if (parsed.photoPath !== undefined) data.photoPath = parsed.photoPath
    if (parsed.validatedAt !== undefined) {
      data.validatedAt = parsed.validatedAt ? new Date(parsed.validatedAt) : null
    }
    if (parsed.notes !== undefined) data.notes = parsed.notes
    if (parsed.convertedClientId !== undefined) {
      data.convertedClientId = parsed.convertedClientId
    }

    const lead = await prisma.commercialLead.update({
      where: { id },
      data,
    })
    return NextResponse.json(lead)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  }
}
