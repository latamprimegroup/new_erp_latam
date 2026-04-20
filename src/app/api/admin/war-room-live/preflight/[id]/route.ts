import { NextResponse } from 'next/server'
import { CampaignPreflightStatus } from '@prisma/client'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  status: z.nativeEnum(CampaignPreflightStatus).optional(),
  checklistJson: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: z.enum(['ok', 'adjust', 'pending']),
      })
    )
    .optional(),
  analystNotes: z.string().max(8000).optional().nullable(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'COMMERCIAL', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const existing = await prisma.campaignPreflightReview.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let nextStatus = body.status
  if (nextStatus === undefined) {
    if (body.checklistJson && body.checklistJson.length > 0) {
      nextStatus = CampaignPreflightStatus.COMPLETED
    } else if (body.analystNotes != null && existing.status === CampaignPreflightStatus.SUBMITTED) {
      nextStatus = CampaignPreflightStatus.IN_ANALYSIS
    } else {
      nextStatus = existing.status
    }
  }

  const updated = await prisma.campaignPreflightReview.update({
    where: { id },
    data: {
      status: nextStatus,
      ...(body.checklistJson !== undefined ? { checklistJson: body.checklistJson } : {}),
      ...(body.analystNotes !== undefined ? { analystNotes: body.analystNotes } : {}),
    },
  })

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    checklistJson: updated.checklistJson,
  })
}
