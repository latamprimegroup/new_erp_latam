import { AdsTrackerCampaignStatus, type PrismaClient } from '@prisma/client'
import { buildEdgePayload } from '@/lib/ads-tracker/edge-payload'
import { notifyAdsTrackerEdge } from '@/lib/ads-tracker/edge-webhook'
import { checkUrlSafeBrowsing, safeBrowsingUrlForDomainHost } from '@/lib/ads-tracker/safe-browsing'
import { collectActiveTrackerDomainHosts } from '@/lib/ads-tracker/collect-tracker-domains'
import { sendTrackerTelegramAlert } from '@/lib/tracker-telegram-alert'

function mapCheckToCampaignFields(r: Awaited<ReturnType<typeof checkUrlSafeBrowsing>>): {
  safeBrowsingStatus: string
  safeBrowsingDetail: string | null
} {
  if (r.status === 'OK') return { safeBrowsingStatus: 'OK', safeBrowsingDetail: null }
  if (r.status === 'WARNING') return { safeBrowsingStatus: 'WARNING', safeBrowsingDetail: r.detail.slice(0, 500) }
  if (r.status === 'SKIPPED') return { safeBrowsingStatus: 'SKIPPED', safeBrowsingDetail: r.detail.slice(0, 500) }
  return { safeBrowsingStatus: 'ERROR', safeBrowsingDetail: r.detail.slice(0, 500) }
}

async function triggerPanicForDomain(prisma: PrismaClient, domainHost: string): Promise<number> {
  const rows = await prisma.adsTrackerCampaign.findMany({
    where: {
      domainHost,
      status: AdsTrackerCampaignStatus.ACTIVE,
      emergencyContingency: false,
    },
  })
  let n = 0
  for (const row of rows) {
    const next = await prisma.adsTrackerCampaign.update({
      where: { id: row.id },
      data: { emergencyContingency: true },
    })
    await notifyAdsTrackerEdge({
      overrideUrl: next.edgeWebhookOverrideUrl,
      payload: buildEdgePayload(next, 'emergency_contingency'),
    })
    n += 1
  }
  return n
}

export type DomainReputationJobResult = {
  domainsChecked: number
  warnings: number
  errors: number
  telegramSent: number
  panicCampaigns: number
}

/**
 * Consulta Safe Browsing por domínio, grava histórico, atualiza campanhas, Telegram e panic opcional.
 */
export async function runTrackerDomainReputationJob(prisma: PrismaClient): Promise<DomainReputationJobResult> {
  const hosts = await collectActiveTrackerDomainHosts(prisma)
  const autoPanic = process.env.TRACKER_DOMAIN_REPUTATION_AUTO_PANIC === '1'
  const now = new Date()

  let warnings = 0
  let errors = 0
  let telegramSent = 0
  let panicCampaigns = 0

  for (const host of hosts) {
    const probeUrl = safeBrowsingUrlForDomainHost(host)
    const prev = await prisma.trackerDomainReputationCheck.findFirst({
      where: { domainHost: host },
      orderBy: { checkedAt: 'desc' },
    })

    const r = await checkUrlSafeBrowsing(probeUrl)
    const { safeBrowsingStatus, safeBrowsingDetail } = mapCheckToCampaignFields(r)

    if (r.status === 'WARNING') warnings += 1
    if (r.status === 'ERROR') errors += 1

    let panicN = 0
    if (autoPanic && r.status === 'WARNING' && prev?.status !== 'WARNING') {
      panicN = await triggerPanicForDomain(prisma, host)
      panicCampaigns += panicN
    }
    const panicTriggered = panicN > 0

    await prisma.trackerDomainReputationCheck.create({
      data: {
        domainHost: host,
        status: safeBrowsingStatus,
        detail: safeBrowsingDetail,
        panicTriggered,
      },
    })

    await prisma.adsTrackerCampaign.updateMany({
      where: { domainHost: host, status: { not: AdsTrackerCampaignStatus.ARCHIVED } },
      data: {
        safeBrowsingStatus,
        safeBrowsingDetail,
        safeBrowsingCheckedAt: now,
      },
    })

    const shouldTelegram = r.status === 'WARNING' && prev?.status !== 'WARNING'
    if (shouldTelegram) {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const tg = await sendTrackerTelegramAlert(
        `<b>Ads Tracker — Safe Browsing</b>\nDomínio: <code>${esc(host)}</code>\nEstado: <b>ALERTA</b>\n${esc(safeBrowsingDetail || 'Listado nas bases Google (malware/phishing/software indesejado).')}\n${panicTriggered ? `\n<i>Panic contingency acionado em ${panicN} campanha(s) ativa(s).</i>` : ''}`,
      )
      if (tg.ok) telegramSent += 1
    }
  }

  return {
    domainsChecked: hosts.length,
    warnings,
    errors,
    telegramSent,
    panicCampaigns,
  }
}
