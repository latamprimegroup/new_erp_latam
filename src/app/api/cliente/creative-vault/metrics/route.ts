import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  metricDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spend: z.number().nonnegative().max(1e12),
  clicks: z.number().int().nonnegative().max(1e9),
  ctrPercent: z.number().min(0).max(100),
  cpc: z.number().nonnegative().max(1e6),
  sales: z.number().nonnegative().max(1e12),
  label: z.string().max(160).optional(),
  jobId: z.string().optional().nullable(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const d = new Date(body.metricDate + 'T12:00:00.000Z')
  if (Number.isNaN(d.getTime())) {
    return NextResponse.json({ error: 'Data inválida' }, { status: 400 })
  }

  if (body.jobId) {
    const job = await prisma.creativeAgencyJob.findFirst({
      where: { id: body.jobId, clientId: client.id },
    })
    if (!job) return NextResponse.json({ error: 'Edição não encontrada' }, { status: 404 })
  }

  const row = await prisma.creativeAdMetricsEntry.create({
    data: {
      clientId: client.id,
      jobId: body.jobId || null,
      metricDate: d,
      spend: body.spend,
      clicks: body.clicks,
      ctrPercent: body.ctrPercent,
      cpc: body.cpc,
      sales: body.sales,
      label: body.label?.trim() || null,
    },
  })

  return NextResponse.json({ id: row.id })
}
