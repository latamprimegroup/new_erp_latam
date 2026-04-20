import type {
  LiveProofLabCase,
  LiveProofLabInsight,
  LiveProofLabScreenshot,
  LiveProofLabSpendDay,
} from '@prisma/client'
import { approvedRevenueSince, computeRoiNetPercent } from '@/lib/live-proof-labs/metrics'

/** Estados visíveis ao mentorado (exclui DRAFT) */
export type LiveProofClientStatus = 'EM_TESTE' | 'VALIDADA' | 'REPROVADA' | 'EM_ESCALA'

export type ClientCaseListItem = {
  slug: string
  title: string
  productLabel: string
  nicheLabel: string
  headline: string | null
  status: LiveProofClientStatus
  spend24hBrl: number | null
  spend7dBrl: number | null
  revenue24hBrl: number
  revenue7dBrl: number
  roiNet24hPercent: number | null
  roiNet7dPercent: number | null
  validatedAt: string | null
  graveyardReason: string | null
  graveyardLossBrl: number | null
  gastoTotalBrl: number | null
  cpaMedioBrl: number | null
  roiLiquidoPercent: number | null
  volumeVendas: number | null
  metricsSyncedAt: string | null
}

function num(d: unknown): number | null {
  if (d == null) return null
  if (typeof d === 'object' && d !== null && 'toNumber' in d) {
    try {
      const x = (d as { toNumber: () => number }).toNumber()
      return Number.isFinite(x) ? x : null
    } catch {
      return null
    }
  }
  const n = Number(d)
  return Number.isFinite(n) ? n : null
}

export async function toClientListItem(
  row: LiveProofLabCase & { internalTrackerOfferId: string | null },
): Promise<ClientCaseListItem> {
  const now = Date.now()
  const h24 = new Date(now - 24 * 3600 * 1000)
  const d7 = new Date(now - 7 * 86400000 * 1000)

  let revenue24 = 0
  let revenue7 = 0
  if (row.internalTrackerOfferId) {
    ;[revenue24, revenue7] = await Promise.all([
      approvedRevenueSince(row.internalTrackerOfferId, h24),
      approvedRevenueSince(row.internalTrackerOfferId, d7),
    ])
  }

  const s24 = num(row.spend24hBrl)
  const s7 = num(row.spend7dBrl)

  return {
    slug: row.slug,
    title: row.title,
    productLabel: row.productLabel,
    nicheLabel: row.nicheLabel,
    headline: row.headline,
    status: row.status as LiveProofClientStatus,
    spend24hBrl: s24,
    spend7dBrl: s7,
    revenue24hBrl: revenue24,
    revenue7dBrl: revenue7,
    roiNet24hPercent: s24 != null ? computeRoiNetPercent({ revenue: revenue24, spend: s24 }) : null,
    roiNet7dPercent: s7 != null ? computeRoiNetPercent({ revenue: revenue7, spend: s7 }) : null,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    graveyardReason: row.graveyardReason,
    graveyardLossBrl: num(row.graveyardLossBrl),
    gastoTotalBrl: num(row.gastoTotalBrl),
    cpaMedioBrl: num(row.cpaMedioBrl),
    roiLiquidoPercent: num(row.roiLiquidoPercent),
    volumeVendas: row.volumeVendas ?? null,
    metricsSyncedAt: row.metricsSyncedAt?.toISOString() ?? null,
  }
}

export type ClientCaseDetail = ClientCaseListItem & {
  summary: string | null
  analysisText: string | null
  cpaIdealBrl: number | null
  scaleBudgetHintBrl: number | null
  suggestedCheckoutUrl: string | null
  defaultOfferPlatform: string | null
  hasTemplate: boolean
  screenshots: Array<{ imageUrl: string; caption: string | null; capturedAt: string | null }>
  insights: Array<{ kind: string; mediaUrl: string; title: string | null }>
  /** Últimos 7 dias de gasto real (banca interna) */
  skinInGame7d: Array<{ day: string; amountBrl: number }>
}

export function mergeDetail(
  base: ClientCaseListItem,
  row: LiveProofLabCase,
  screenshots: LiveProofLabScreenshot[],
  insights: LiveProofLabInsight[],
  spendDays: LiveProofLabSpendDay[],
): ClientCaseDetail {
  const skinInGame7d = spendDays.map((s) => ({
    day: s.day.toISOString().slice(0, 10),
    amountBrl: num(s.amountBrl) ?? 0,
  }))

  return {
    ...base,
    summary: row.summary,
    analysisText: row.analysisText,
    cpaIdealBrl: num(row.cpaIdealBrl),
    scaleBudgetHintBrl: num(row.scaleBudgetHintBrl),
    suggestedCheckoutUrl: row.suggestedCheckoutUrl,
    defaultOfferPlatform: row.defaultOfferPlatform != null ? String(row.defaultOfferPlatform) : null,
    hasTemplate: Boolean(row.creativeTemplateId),
    screenshots: screenshots.map((s) => ({
      imageUrl: s.imageUrl,
      caption: s.caption,
      capturedAt: s.capturedAt?.toISOString() ?? null,
    })),
    insights: insights.map((i) => ({ kind: i.kind, mediaUrl: i.mediaUrl, title: i.title })),
    skinInGame7d,
  }
}
