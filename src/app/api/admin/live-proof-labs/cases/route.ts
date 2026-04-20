import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { TrackerOfferPlatform } from '@prisma/client'
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

const createSchema = z.object({
  slug: z.string().min(2).max(96).regex(slugRe, 'slug: só minúsculas, números e hífens'),
  title: z.string().min(2).max(200),
  productLabel: z.string().min(1).max(200),
  nicheLabel: z.string().min(1).max(120),
  headline: z.string().max(320).optional().nullable(),
  summary: z.string().max(20000).optional().nullable(),
  status: z.enum(['DRAFT', 'EM_TESTE', 'VALIDADA', 'REPROVADA', 'EM_ESCALA']),
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
  graveyardReason: z.string().max(20000).optional().nullable(),
  graveyardLossBrl: z.number().nonnegative().optional().nullable(),
  sortOrder: z.number().int().optional(),
  validatedAt: z.string().datetime().optional().nullable(),
  screenshots: z.array(screenshotIn).optional(),
  insights: z.array(insightIn).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const rows = await prisma.liveProofLabCase.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: {
      _count: { select: { screenshots: true, insights: true, replicates: true } },
    },
  })

  return NextResponse.json({ cases: rows })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await req.json())
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
      where: { internalTrackerOfferId: body.internalTrackerOfferId },
      select: { id: true },
    })
    if (taken) return NextResponse.json({ error: 'Esta oferta já está ligada a outro caso.' }, { status: 400 })
  }

  if (body.creativeTemplateId) {
    const t = await prisma.creativeVaultTemplate.findUnique({
      where: { id: body.creativeTemplateId },
      select: { id: true },
    })
    if (!t) return NextResponse.json({ error: 'Template Creative Vault não encontrado.' }, { status: 400 })
  }

  const validatedAt = body.validatedAt ? new Date(body.validatedAt) : null

  const row = await prisma.liveProofLabCase.create({
    data: {
      slug: body.slug,
      title: body.title,
      productLabel: body.productLabel,
      nicheLabel: body.nicheLabel,
      headline: body.headline ?? null,
      summary: body.summary ?? null,
      status: body.status,
      publishedToClients: body.publishedToClients ?? false,
      internalTrackerOfferId: body.internalTrackerOfferId ?? null,
      creativeTemplateId: body.creativeTemplateId ?? null,
      suggestedCheckoutUrl: body.suggestedCheckoutUrl ?? null,
      defaultOfferPlatform: body.defaultOfferPlatform ?? null,
      vslScriptNotes: body.vslScriptNotes ?? null,
      analysisText: body.analysisText ?? null,
      cpaIdealBrl: body.cpaIdealBrl ?? null,
      scaleBudgetHintBrl: body.scaleBudgetHintBrl ?? null,
      spend24hBrl: body.spend24hBrl ?? null,
      spend7dBrl: body.spend7dBrl ?? null,
      gastoTotalBrl: body.gastoTotalBrl ?? null,
      cpaMedioBrl: body.cpaMedioBrl ?? null,
      roiLiquidoPercent: body.roiLiquidoPercent ?? null,
      volumeVendas: body.volumeVendas ?? null,
      graveyardReason: body.graveyardReason ?? null,
      graveyardLossBrl: body.graveyardLossBrl ?? null,
      sortOrder: body.sortOrder ?? 0,
      validatedAt,
      screenshots: body.screenshots?.length
        ? {
            create: body.screenshots.map((s, i) => ({
              imageUrl: s.imageUrl,
              caption: s.caption ?? null,
              capturedAt: s.capturedAt ? new Date(s.capturedAt) : null,
              sortOrder: s.sortOrder ?? i,
            })),
          }
        : undefined,
      insights: body.insights?.length
        ? {
            create: body.insights.map((s, i) => ({
              kind: s.kind,
              mediaUrl: s.mediaUrl,
              title: s.title ?? null,
              sortOrder: s.sortOrder ?? i,
            })),
          }
        : undefined,
    },
    include: { screenshots: true, insights: true },
  })

  return NextResponse.json({ case: row })
}
