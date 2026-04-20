import { AccountPlatform } from '@prisma/client'

export const DASHBOARD_PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todas as plataformas' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'KWAI_ADS', label: 'Kwai Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
  { value: 'OTHER', label: 'Outras' },
]

/** null = todas as plataformas */
export function parseDashboardPlatformParam(raw: string | null): AccountPlatform | null {
  if (!raw || raw === 'ALL') return null
  const u = raw.toUpperCase()
  if ((Object.values(AccountPlatform) as string[]).includes(u)) {
    return u as AccountPlatform
  }
  return null
}
