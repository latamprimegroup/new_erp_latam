import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  caseSlug: z.string().min(1).max(96),
  spendByDay: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amountBrl: z.number().nonnegative(),
      }),
    )
    .optional(),
  spend24hBrl: z.number().nonnegative().optional(),
  spend7dBrl: z.number().nonnegative().optional(),
  gastoTotalBrl: z.number().nonnegative().optional(),
  cpaMedioBrl: z.number().nonnegative().optional(),
  roiLiquidoPercent: z.number().optional(),
  volumeVendas: z.number().int().nonnegative().optional(),
})

/**
 * Webhook interno (Sheets / Make / script da equipa) para sincronizar métricas e série de gasto.
 * Header: x-live-proof-secret: <LIVE_PROOF_LABS_WEBHOOK_SECRET>
 */
export async function POST(req: Request) {
  const secret = process.env.LIVE_PROOF_LABS_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 })
  }
  const hdr = req.headers.get('x-live-proof-secret')?.trim()
  if (hdr !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Payload inválido' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const c = await prisma.liveProofLabCase.findUnique({
    where: { slug: body.caseSlug },
    select: { id: true },
  })
  if (!c) {
    return NextResponse.json({ error: 'Caso não encontrado' }, { status: 404 })
  }

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.liveProofLabCase.update({
      where: { id: c.id },
      data: {
        ...(body.spend24hBrl !== undefined ? { spend24hBrl: body.spend24hBrl } : {}),
        ...(body.spend7dBrl !== undefined ? { spend7dBrl: body.spend7dBrl } : {}),
        ...(body.gastoTotalBrl !== undefined ? { gastoTotalBrl: body.gastoTotalBrl } : {}),
        ...(body.cpaMedioBrl !== undefined ? { cpaMedioBrl: body.cpaMedioBrl } : {}),
        ...(body.roiLiquidoPercent !== undefined ? { roiLiquidoPercent: body.roiLiquidoPercent } : {}),
        ...(body.volumeVendas !== undefined ? { volumeVendas: body.volumeVendas } : {}),
        metricsSyncedAt: now,
      },
    })

    if (body.spendByDay?.length) {
      for (const row of body.spendByDay) {
        const d = new Date(row.date + 'T12:00:00.000Z')
        const existing = await tx.liveProofLabSpendDay.findFirst({
          where: { caseId: c.id, day: d },
          select: { id: true },
        })
        if (existing) {
          await tx.liveProofLabSpendDay.update({
            where: { id: existing.id },
            data: { amountBrl: row.amountBrl },
          })
        } else {
          await tx.liveProofLabSpendDay.create({
            data: { caseId: c.id, day: d, amountBrl: row.amountBrl },
          })
        }
      }
    }
  })

  return NextResponse.json({ ok: true, caseId: c.id, syncedAt: now.toISOString() })
}
