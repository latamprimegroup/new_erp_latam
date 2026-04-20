import type { PrismaClient } from '@prisma/client'
import { normalizeAdsCoreSiteUrl } from '@/lib/ads-core-utils'
import { parseUrlHistory } from '@/lib/ads-core-url-history'

/** True se a URL normalizada aparece só no histórico (old/new), não em site_url atual. */
export async function isSiteUrlOnlyInHistory(
  prisma: PrismaClient,
  normalizedUrl: string,
  excludeAssetId?: string
): Promise<boolean> {
  const rows = await prisma.adsCoreAsset.findMany({
    where: excludeAssetId ? { id: { not: excludeAssetId } } : {},
    select: { historicoUrls: true },
  })
  for (const r of rows) {
    for (const e of parseUrlHistory(r.historicoUrls)) {
      const o = e.old ? normalizeAdsCoreSiteUrl(e.old) : null
      const n = e.new ? normalizeAdsCoreSiteUrl(e.new) : null
      if (o === normalizedUrl || n === normalizedUrl) return true
    }
  }
  return false
}
