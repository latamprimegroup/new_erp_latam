import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  fetchPolicyPageText,
  GOOGLE_ADS_DECEPTIVE_POLICY_URL,
  textChangePercent,
} from '@/lib/guard-policy-sync'
import { notifyAdminsGuardPolicyPageChanged } from '@/lib/notifications/admin-events'
import { postGuardWebhook } from '@/lib/guard-webhook'

async function webhookUrlFromDb(): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'guard_notification_webhook' } })
  return row?.value?.trim() || null
}

export async function runGoogleAdsPolicySync(): Promise<{
  ok: boolean
  changePercent?: number
  alerted?: boolean
  error?: string
}> {
  try {
    const text = await fetchPolicyPageText(GOOGLE_ADS_DECEPTIVE_POLICY_URL)
    const hash = createHash('sha256').update(text).digest('hex')

    const last = await prisma.googleAdsPolicySnapshot.findFirst({
      orderBy: { fetchedAt: 'desc' },
    })

    let pct = 0
    let alerted = false
    if (last) {
      pct = textChangePercent(last.normalizedText, text)
      if (pct > 5) {
        alerted = true
        await notifyAdminsGuardPolicyPageChanged(pct, GOOGLE_ADS_DECEPTIVE_POLICY_URL)
        const wh = await webhookUrlFromDb()
        await postGuardWebhook(
          {
            type: 'google_ads_policy_changed',
            changePercent: pct,
            sourceUrl: GOOGLE_ADS_DECEPTIVE_POLICY_URL,
            previousHash: last.contentHash,
            newHash: hash,
          },
          wh,
        )
      }
    }

    await prisma.googleAdsPolicySnapshot.create({
      data: {
        sourceUrl: GOOGLE_ADS_DECEPTIVE_POLICY_URL,
        contentHash: hash,
        normalizedText: text,
      },
    })

    return { ok: true, changePercent: pct, alerted }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
