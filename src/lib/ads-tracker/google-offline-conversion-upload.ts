import { Prisma, type TrackerConversionRule } from '@prisma/client'

export type OfflineConversionUploadInput = {
  rule: TrackerConversionRule
  gclid: string | null | undefined
  conversionDateTime: Date
  value: Prisma.Decimal
  currencyCode: string
  orderId: string
}

/**
 * Envio para Google Ads (ConversionUploadService / click conversions).
 * Com TRACKER_OFFLINE_GADS_ENABLED=1 e IDs preenchidos, falta ligar à API (google-ads-api).
 */
export async function trySendOfflineConversionUpload(
  input: OfflineConversionUploadInput
): Promise<{ ok: boolean; error?: string }> {
  if (process.env.TRACKER_OFFLINE_GADS_ENABLED !== '1') {
    return { ok: false, error: 'TRACKER_OFFLINE_GADS_ENABLED≠1' }
  }

  const cid = input.rule.googleAdsCustomerId?.replace(/\D/g, '') || ''
  const actionId = input.rule.googleConversionActionId?.trim() || ''
  if (!cid || !actionId) {
    return { ok: false, error: 'Defina Google Ads Customer ID e Conversion Action ID na regra.' }
  }

  const g = input.gclid?.trim()
  if (!g) {
    return { ok: false, error: 'Sem gclid para upload.' }
  }

  return {
    ok: false,
    error:
      'Upload offline (ConversionUploadService) pendente de implementação no ERP — ver google-ads-api e resource da ação.',
  }
}
