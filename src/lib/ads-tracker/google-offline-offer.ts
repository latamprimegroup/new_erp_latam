import type { TrackerOffer, TrackerOfferSaleSignal } from '@prisma/client'

/**
 * Envio de conversão offline (Google Ads). Desativado por defeito.
 *
 * Quando TRACKER_OFFLINE_GADS_ENABLED=1, preparar credenciais e implementação real
 * (ConversionUploadService / gclid + conversion_action + conversion_date_time).
 */
export async function trySendGoogleOfflineForSignal(
  _offer: TrackerOffer,
  _signal: TrackerOfferSaleSignal
): Promise<{ ok: boolean; error?: string }> {
  if (process.env.TRACKER_OFFLINE_GADS_ENABLED !== '1') {
    return { ok: false, error: 'TRACKER_OFFLINE_GADS_ENABLED≠1' }
  }
  return {
    ok: false,
    error: 'Upload offline Google Ads ainda não ligado — defina ação de conversão e credenciais MCC.',
  }
}
