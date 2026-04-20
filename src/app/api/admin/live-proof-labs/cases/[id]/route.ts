import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { TrackerOfferPlatform, type Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const screenshotIn = z.object({
  imageUrl: z.string().min(8).max(2000),
  caption: z.string().max(300).optional().nullable(),
  capturedAt: z.string().datetime().optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const insightIn = z.object({
  kind: z.enum(['AUDIO', 'VIDEO']),
  mediaUrl: z.string().min(8).max(2000),
  title: z.string().max(200).optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const patchSchema = z.object({
  slug: z.string().min(2).max(96).regex(slugRe).optional(),
  title: z.string().min(2).max(200).optional(),
  productLabel: z.string().min(1).max(200).optional(),
  nicheLabel: z.string().min(1).max(120).optional(),
  headline: z.string().max(320).optional().nullable(),
  summary: z.string().max(20000).optional().nullable(),
  status: z.enum(['DRAFT', 'EM_TESTE', 'VALIDADA', 'REPROVADA', 'EM_ESCALA']).optional(),
  publishedToClients: z.boolean().optional(),
  internalTrackerOfferId: z.string().min(1).optional().nullable(),
  creativeTemplateId: z.string().min(1).optional().nullable(),
  suggestedCheckoutUrl: z.string().max(2000).optional().nullable(),
  defaultOfferPlatform: z.nativeEnum(TrackerOfferPlatform).optional().nullable(),
  vslScriptNotes: z.string().max(20000).optional().nullable(),
  analysisText: z.string().max(20000).optional().nullable(),
  cpaIdealBrl: z.number().nonnegative().optional().nullable(),
  scaleBudgetHintBrl: z.number().nonnegative().optional().nullable(),
  spend24hBrl: z.number().nonnegative().optional().nullable(),
  spend7dBrl: z.number().nonnegative().optional().nullable(),
  gastoTotalBrl: z.number().nonnegative().optional().nullable(),
  cpaMedioBrl: z.number().nonnegative().optional().nullable(),
  roiLiquidoPercent: z.number().optional().nullable(),
  volumeVendas: z.number().int().nonnegative().optional().nullable(),
  metricsSyncedAt: z.string().datetime().optional().nullable(),
  graveyardReason: z.string().max(20000).optional().nullable(),
  graveyardLossBrl: z.number().nonnegative().optional().nullable(),
  sortOrder: z.number().int().optional(),
  validatedAt: z.string().datetime().optional().nullable(),
  screenshots: z.array(screenshotIn).optional(),
  insights: z.array(insightIn).optional(),
})

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await ctx.params
  const row = await prisma.liveProofLabCase.findUnique({
    where: { id },
    include: { screenshots: { orderBy: { sortOrder: 'asc' } }, insights: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ case: row })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await ctx.params
  const existing = await prisma.liveProofLabCase.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.internalTrackerOfferId) {
    const offer = await prisma.trackerOffer.findUnique({
      where: { id: body.internalTrackerOfferId },
      select: { id: true },
    })
    if (!offer) return NextResponse.json({ error: 'Oferta tracker não encontrada.' }, { status: 400 })
    const taken = await prisma.liveProofLabCase.findFirst({
      where: { internalTrackerOfferId: body.internalTrackerOfferId, NOT: { id } },
      select: { id: true },
    })
    if (taken) return NextResponse.json({ error: 'Esta oferta já está ligada a outro caso.' }, { status: 400 })
  }

  if (body.creativeTemplateId) {
    const t = await prisma.creativeVaultTemplate.findUnique({
      where: { id: body.creativeTemplateId },
      select: { id: true },
    })
    if (!t) return NextResponse.json({ error: 'Template não encontrado.' }, { status: 400 })
  }

  const validatedAt =
    body.validatedAt === undefined ? undefined : body.validatedAt ? new Date(body.validatedAt) : null

  const { screenshots, insights, ...rest } = body

  const data: Prisma.LiveProofLabCaseUncheckedUpdateInput = {}
  if (rest.slug !== undefined) data.slug = rest.slug
  if (rest.title !== undefined) data.title = rest.title
  if (rest.productLabel !== undefined) data.productLabel = rest.productLabel
  if (rest.nicheLabel !== undefined) data.nicheLabel = rest.nicheLabel
  if (rest.headline !== undefined) data.headline = rest.headline
  if (rest.summary !== undefined) data.summary = rest.summary
  if (rest.status !== undefined) data.status = rest.status
  if (rest.publishedToClients !== undefined) data.publishedToClients = rest.publishedToClients
  if (rest.internalTrackerOfferId !== undefined) {
    data.internalTrackerOfferId = rest.internalTrackerOfferId ?? null
  }
  if (rest.creativeTemplateId !== undefined) {
    data.creativeTemplateId = rest.creativeTemplateId ?? null
  }
  if (rest.suggestedCheckoutUrl !== undefined) data.suggestedCheckoutUrl = rest.suggestedCheckoutUrl
  if (rest.defaultOfferPlatform !== undefined) data.defaultOfferPlatform = rest.defaultOfferPlatform
  if (rest.vslScriptNotes !== undefined) data.vslScriptNotes = rest.vslScriptNotes
  if (rest.analysisText !== undefined) data.analysisText = rest.analysisText
  if (rest.cpaIdealBrl !== undefined) data.cpaIdealBrl = rest.cpaIdealBrl
  if (rest.scaleBudgetHintBrl !== undefined) data.scaleBudgetHintBrl = rest.scaleBudgetHintBrl
  if (rest.spend24hBrl !== undefined) data.spend24hBrl = rest.spend24hBrl
  if (rest.spend7dBrl !== undefined) data.spend7dBrl = rest.spend7dBrl
  if (rest.gastoTotalBrl !== undefined) data.gastoTotalBrl = rest.gastoTotalBrl
  if (rest.cpaMedioBrl !== undefined) data.cpaMedioBrl = rest.cpaMedioBrl
  if (rest.roiLiquidoPercent !== undefined) data.roiLiquidoPercent = rest.roiLiquidoPercent
  if (rest.volumeVendas !== undefined) data.volumeVendas = rest.volumeVendas
  if (rest.metricsSyncedAt !== undefined) {
    data.metricsSyncedAt = rest.metricsSyncedAt ? new Date(rest.metricsSyncedAt) : null
  }
  if (rest.graveyardReason !== undefined) data.graveyardReason = rest.graveyardReason
  if (rest.graveyardLossBrl !== undefined) data.graveyardLossBrl = rest.graveyardLossBrl
  if (rest.sortOrder !== undefined) data.sortOrder = rest.sortOrder
  if (validatedAt !== undefined) data.validatedAt = validatedAt

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.liveProofLabCase.update({
        where: { id },
        data,
      })
    }

    if (screenshots) {
      await tx.liveProofLabScreenshot.deleteMany({ where: { caseId: id } })
      if (screenshots.length) {
        await tx.liveProofLabScreenshot.createMany({
          data: screenshots.map((s, i) => ({
            caseId: id,
            imageUrl: s.imageUrl,
            caption: s.caption ?? null,
            capturedAt: s.capturedAt ? new Date(s.capturedAt) : null,
            sortOrder: s.sortOrder ?? i,
          })),
        })
      }
    }

    if (insights) {
      await tx.liveProofLabInsight.deleteMany({ where: { caseId: id } })
      if (insights.length) {
        await tx.liveProofLabInsight.createMany({
          data: insights.map((s, i) => ({
            caseId: id,
            kind: s.kind,
            mediaUrl: s.mediaUrl,
            title: s.title ?? null,
            sortOrder: s.sortOrder ?? i,
          })),
        })
      }
    }
  })

  const row = await prisma.liveProofLabCase.findUnique({
    where: { id },
    include: { screenshots: { orderBy: { sortOrder: 'asc' } }, insights: { orderBy: { sortOrder: 'asc' } } },
  })

  return NextResponse.json({ case: row })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await ctx.params
  const row = await prisma.liveProofLabCase.findUnique({ where: { id }, select: { id: true } })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  await prisma.liveProofLabCase.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
