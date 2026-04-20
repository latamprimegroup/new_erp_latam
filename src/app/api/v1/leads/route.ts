import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  mergeBehaviorTags,
  parseLeadIngestBody,
  verifyLeadsIngestSecret,
} from '@/lib/intelligence-leads-ingest'
import {
  computeConfidenceScore,
  computeEngagementScore,
  refreshFingerprintAlertsForHash,
  syncIntelligenceLeadFromOrders,
} from '@/lib/intelligence-leads-engine'
import { buildLeadFingerprint, clientIpFromHeaders } from '@/lib/intelligence-leads-fingerprint'
import { refreshHotStalledAlert } from '@/lib/intelligence-hot-stalled'
import { recordLeadIngestPulse } from '@/lib/lead-ingest-pulse'
import { refreshLeadCommercialAiBrief } from '@/lib/intelligence-lead-ai-brief'

/**
 * POST /api/v1/leads — ingestão WordPress/Elementor (upsert por e-mail).
 * Multi-touch: utm_first_* = primeiro contacto; utm_* = último contacto.
 * Fingerprint: hash IP|User-Agent (sem IP em claro) + alerta se repetido noutro e-mail.
 * Segurança: Authorization: Bearer <ECOSYSTEM_LEADS_INGEST_SECRET> ou X-Leads-Token
 */
export async function GET() {
  const configured = !!process.env.ECOSYSTEM_LEADS_INGEST_SECRET?.trim()
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/v1/leads',
    table: 'intelligence_leads',
    dedupe: 'Um registo por e-mail (unique); POST com mesmo email faz update (upsert lógico), nunca duplica linha.',
    auth: 'Authorization: Bearer <secret> ou header X-Leads-Token',
    secretConfigured: configured,
    security: {
      envVar: 'ECOSYSTEM_LEADS_INGEST_SECRET',
      required: true,
      headers: [
        'Authorization: Bearer <o mesmo valor do .env>',
        'X-Leads-Token: <o mesmo valor do .env> (alternativa ao Bearer)',
      ],
      wordpress:
        'No Elementor/Webhook use URL https://SEU_DOMINIO/api/v1/leads e envie o token no header (muitos plugins permitem headers customizados). Sem token válido o servidor responde 401.',
    },
    hint:
      'Campos: email, nome, whatsapp, utm_source|medium|campaign|content|term (último toque), utm_first_* fixos na criação; trust_score 0–100; cpa_brl / custo_aquisicao; landing_page / lp_slug (+10 pts); checkout_intent (+20 pts); behavior_tags; total_vendas; data_ultima_compra; timeline_note. Eventos: POST /api/v1/leads/events. Headers User-Agent + IP → fingerprint (hash, sem IP em claro).',
  })
}

export async function POST(req: NextRequest) {
  if (!verifyLeadsIngestSecret(req)) {
    const msg = process.env.ECOSYSTEM_LEADS_INGEST_SECRET?.trim()
      ? 'Token inválido ou ausente'
      : 'Webhook desconfigurado: defina ECOSYSTEM_LEADS_INGEST_SECRET no servidor'
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  let data: ReturnType<typeof parseLeadIngestBody>
  try {
    data = parseLeadIngestBody(body)
  } catch (e) {
    if (e instanceof Error && e.message === 'email_obrigatorio') {
      return NextResponse.json({ error: 'Campo email é obrigatório' }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : 'Payload inválido'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const fp = buildLeadFingerprint(clientIpFromHeaders(req.headers), req.headers.get('user-agent'))
  const tagIncoming = data.behaviorTagAdds ?? []
  const now = new Date()
  const checkoutAt = data.checkoutIntent ? now : undefined

  try {
    type PriorRow = {
      id: string
      behaviorTags: unknown
      utmFirstSource: string | null
      utmFirstMedium: string | null
      utmFirstCampaign: string | null
      fingerprintHash: string | null
    }

    let prior = await prisma.intelligenceLead.findUnique({
      where: { email: data.email },
      select: {
        id: true,
        behaviorTags: true,
        utmFirstSource: true,
        utmFirstMedium: true,
        utmFirstCampaign: true,
        fingerprintHash: true,
      },
    })

    let mergedTags =
      tagIncoming.length > 0 ? mergeBehaviorTags(prior?.behaviorTags ?? null, tagIncoming) : undefined

    /** true só quando criámos linha nova neste request (não corrida P2002 → update) */
    let eventIsCapture = !prior

    const applyUpdate = async (p: PriorRow) => {
      const oldHash = p.fingerprintHash
      const updated = await prisma.intelligenceLead.update({
        where: { id: p.id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.whatsapp !== undefined ? { whatsapp: data.whatsapp } : {}),
          ...(data.utmSource != null ? { utmSource: data.utmSource } : {}),
          ...(data.utmMedium != null ? { utmMedium: data.utmMedium } : {}),
          ...(data.utmCampaign != null ? { utmCampaign: data.utmCampaign } : {}),
          ...(data.utmContent != null ? { utmContent: data.utmContent } : {}),
          ...(data.utmTerm != null ? { utmTerm: data.utmTerm } : {}),
          ...(data.trustScore !== undefined ? { trustScore: data.trustScore } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.totalSales !== undefined ? { totalSales: data.totalSales } : {}),
          ...(data.lastPurchaseAt !== undefined ? { lastPurchaseAt: data.lastPurchaseAt } : {}),
          ...(data.landingPageKey != null ? { landingPageKey: data.landingPageKey } : {}),
          ...(data.checkoutIntent ? { checkoutIntentAt: now } : {}),
          ...(fp.hash
            ? { fingerprintHash: fp.hash, fingerprintUserAgent: fp.userAgentStored ?? undefined }
            : {}),
          lastInteractionAt: now,
          ...(data.cpaBrl !== undefined ? { cpaBrl: data.cpaBrl } : {}),
          ...(mergedTags !== undefined ? { behaviorTags: mergedTags } : {}),
        },
        select: { id: true, email: true, fingerprintHash: true },
      })
      await refreshFingerprintAlertsForHash(oldHash)
      await refreshFingerprintAlertsForHash(updated.fingerprintHash ?? fp.hash)
      return { id: updated.id, email: data.email }
    }

    let row: { id: string; email: string }

    if (prior) {
      row = await applyUpdate(prior)
      eventIsCapture = false
    } else {
      try {
        const created = await prisma.intelligenceLead.create({
          data: {
            email: data.email,
            name: data.name,
            whatsapp: data.whatsapp,
            utmSource: data.utmSource,
            utmMedium: data.utmMedium,
            utmCampaign: data.utmCampaign,
            utmContent: data.utmContent,
            utmTerm: data.utmTerm,
            utmFirstSource: data.utmSource,
            utmFirstMedium: data.utmMedium,
            utmFirstCampaign: data.utmCampaign,
            utmFirstContent: data.utmContent,
            utmFirstTerm: data.utmTerm,
            ...(data.trustScore !== undefined ? { trustScore: data.trustScore } : {}),
            status: data.status ?? 'NOVO',
            totalSales: data.totalSales ?? 0,
            lastPurchaseAt: data.lastPurchaseAt ?? null,
            landingPageKey: data.landingPageKey ?? null,
            checkoutIntentAt: checkoutAt ?? null,
            fingerprintHash: fp.hash,
            fingerprintUserAgent: fp.userAgentStored,
            lastInteractionAt: now,
            ...(data.cpaBrl !== undefined ? { cpaBrl: data.cpaBrl } : {}),
            ...(mergedTags !== undefined ? { behaviorTags: mergedTags } : {}),
          },
          select: { id: true, email: true },
        })
        row = created
        await refreshFingerprintAlertsForHash(fp.hash)
      } catch (e: unknown) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          prior = await prisma.intelligenceLead.findUnique({
            where: { email: data.email },
            select: {
              id: true,
              behaviorTags: true,
              utmFirstSource: true,
              utmFirstMedium: true,
              utmFirstCampaign: true,
              fingerprintHash: true,
            },
          })
          mergedTags =
            tagIncoming.length > 0 ? mergeBehaviorTags(prior?.behaviorTags ?? null, tagIncoming) : undefined
          if (!prior) throw e
          row = await applyUpdate(prior)
          eventIsCapture = false
        } else {
          throw e
        }
      }
    }

    const utmLine = [data.utmSource, data.utmMedium, data.utmCampaign].filter(Boolean).join(' · ') || '—'
    await prisma.intelligenceLeadEvent.create({
      data: {
        leadId: row.id,
        occurredAt: now,
        eventType: eventIsCapture ? 'WEBHOOK_CAPTURE' : 'WEBHOOK_UPDATE',
        title: eventIsCapture ? 'Lead capturado' : 'Atualização de captura (webhook)',
        detail: `UTM (último toque): ${utmLine}`,
        metadata: {
          utmSource: data.utmSource,
          utmMedium: data.utmMedium,
          utmCampaign: data.utmCampaign,
          utmContent: data.utmContent,
          utmTerm: data.utmTerm,
          fingerprintHash: fp.hash,
        },
      },
    })

    if (data.checkoutIntent) {
      await prisma.intelligenceLeadEvent.create({
        data: {
          leadId: row.id,
          occurredAt: now,
          eventType: 'CHECKOUT_INTENT',
          title: 'Intenção de checkout',
          detail: 'Sinal de engajamento forte (+20 pts no score).',
          metadata: {},
        },
      })
    }

    if (data.timelineNote) {
      await prisma.intelligenceLeadEvent.create({
        data: {
          leadId: row.id,
          occurredAt: now,
          eventType: 'NOTE',
          title: 'Nota (webhook)',
          detail: data.timelineNote,
          metadata: {},
        },
      })
    }

    if (tagIncoming.length) {
      await prisma.intelligenceLeadEvent.create({
        data: {
          leadId: row.id,
          occurredAt: now,
          eventType: 'BEHAVIOR_TAGS',
          title: 'Tags comportamentais',
          detail: tagIncoming.join(', '),
          metadata: { tags: tagIncoming },
        },
      })
    }

    try {
      await syncIntelligenceLeadFromOrders(row.id)
    } catch {
      /* LTV sync opcional se ainda não há user com este e-mail */
    }

    const latest = await prisma.intelligenceLead.findUnique({
      where: { id: row.id },
      select: {
        landingPageKey: true,
        checkoutIntentAt: true,
        purchaseCount: true,
        totalSales: true,
        status: true,
        whatsapp: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
      },
    })
    if (latest) {
      await prisma.intelligenceLead.update({
        where: { id: row.id },
        data: {
          engagementScore: computeEngagementScore(latest),
          confidenceScore: computeConfidenceScore({
            whatsapp: latest.whatsapp,
            utmSource: latest.utmSource,
            utmMedium: latest.utmMedium,
            utmCampaign: latest.utmCampaign,
            checkoutIntentAt: latest.checkoutIntentAt,
            purchaseCount: latest.purchaseCount,
          }),
        },
      })
    }

    await refreshHotStalledAlert(row.id)

    try {
      await recordLeadIngestPulse()
    } catch {
      /* não bloquear ingest */
    }
    if (process.env.LEAD_AI_BRIEF_AUTO === 'true') {
      void refreshLeadCommercialAiBrief(row.id).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      id: row.id,
      email: row.email,
      multiTouch: {
        last: {
          source: data.utmSource,
          medium: data.utmMedium,
          campaign: data.utmCampaign,
          content: data.utmContent,
          term: data.utmTerm,
        },
      },
    })
  } catch (e) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[api/v1/leads] ingest failed')
    } else {
      console.error('[api/v1/leads]', e)
    }
    const expose =
      process.env.NODE_ENV !== 'production' && e instanceof Error ? e.message : 'Erro interno ao processar lead'
    return NextResponse.json({ error: expose }, { status: 500 })
  }
}
