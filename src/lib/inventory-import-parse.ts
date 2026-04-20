import type { AccountPlatform } from '@prisma/client'

const PLATFORMS = new Set<string>(['GOOGLE_ADS', 'META_ADS', 'KWAI_ADS', 'TIKTOK_ADS', 'OTHER'])

export type ParsedInventoryRow = {
  platform: AccountPlatform
  type: string
  spendCurrency: string
  spendAmount: number
  purchasePriceBrl: number
  supplierId: string | null
  yearStarted: number | null
  niche: string | null
  markupPercent: number | null
}

function num(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Uma linha por ativo. Formato (separador , ; ou tab):
 * plataforma, tipo, moeda_spend, valor_spend, custo_brl [, supplierId [, ano [, nicho [, margem%]]]]
 */
export function parseInventoryBulkLines(raw: string): ParsedInventoryRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const out: ParsedInventoryRow[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (i === 0 && /^platform\b/i.test(line)) continue

    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''))
    if (parts.length < 5) continue

    const platform = parts[0]!.toUpperCase()
    if (!PLATFORMS.has(platform)) continue

    const type = parts[1] || 'G2'
    const spendCurrency = (parts[2] || 'USD').toUpperCase().slice(0, 8)
    const spendAmount = num(parts[3] ?? '')
    const purchasePriceBrl = num(parts[4] ?? '')
    if (spendAmount == null || purchasePriceBrl == null) continue

    const supplierId = parts[5]?.trim() ? parts[5]!.trim() : null
    const yearPart = parts[6]?.trim()
    const yearStarted = yearPart && /^\d{4}$/.test(yearPart) ? parseInt(yearPart, 10) : null
    const niche = parts[7]?.trim() || null
    const markupPercent = parts[8]?.trim() ? num(parts[8]!) : null

    out.push({
      platform: platform as AccountPlatform,
      type,
      spendCurrency,
      spendAmount,
      purchasePriceBrl,
      supplierId,
      yearStarted,
      niche,
      markupPercent,
    })
  }
  return out
}
