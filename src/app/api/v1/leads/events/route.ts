import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { verifyLeadsIngestSecret } from '@/lib/intelligence-leads-ingest'
import { refreshHotStalledAlert } from '@/lib/intelligence-hot-stalled'

const bodySchema = z.object({
  email: z.string().email().max(254),
  event_type: z.string().min(1).max(64).optional(),
  eventType: z.string().min(1).max(64).optional(),
  title: z.string().max(300).optional(),
  detail: z.string().max(4000).optional(),
  vsl_progress_pct: z.number().min(0).max(100).optional(),
  metadata: z.record(z.any()).optional(),
})

/**
 * POST /api/v1/leads/events — heatmap de intenção (e-mail aberto, clique, VSL %, etc.)
 * Mesmo auth que POST /api/v1/leads (Bearer / X-Leads-Token).
 */
export async function POST(req: NextRequest) {
  if (!verifyLeadsIngestSecret(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Payload inválido' }, { status: 400 })
  }

  const email = parsed.data.email.trim().toLowerCase()
  const typeRaw = parsed.data.event_type || parsed.data.eventType || 'BEHAVIOR'
  const type = typeRaw.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64).toUpperCase() || 'BEHAVIOR'

  let title = parsed.data.title?.trim() || `Evento: ${type}`
  const detailParts: string[] = []
  if (parsed.data.detail) detailParts.push(parsed.data.detail.trim())
  if (parsed.data.vsl_progress_pct != null) {
    detailParts.push(`VSL ~${parsed.data.vsl_progress_pct}%`)
    if (!parsed.data.title) title = `VSL ${parsed.data.vsl_progress_pct}%`
  }
  const detail = detailParts.length ? detailParts.join(' · ') : null
  const metadata = {
    ...(parsed.data.metadata && typeof parsed.data.metadata === 'object' ? parsed.data.metadata : {}),
    ...(parsed.data.vsl_progress_pct != null ? { vslProgressPct: parsed.data.vsl_progress_pct } : {}),
  }

  const lead = await prisma.intelligenceLead.findUnique({ where: { email }, select: { id: true } })
  if (!lead) {
    return NextResponse.json({ error: 'Lead não encontrado para este e-mail' }, { status: 404 })
  }

  await prisma.intelligenceLeadEvent.create({
    data: {
      leadId: lead.id,
      occurredAt: new Date(),
      eventType: type,
      title: title.slice(0, 300),
      detail,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    },
  })

  await prisma.intelligenceLead.update({
    where: { id: lead.id },
    data: { lastInteractionAt: new Date() },
  })

  await refreshHotStalledAlert(lead.id)

  return NextResponse.json({ ok: true, leadId: lead.id, eventType: type })
}
