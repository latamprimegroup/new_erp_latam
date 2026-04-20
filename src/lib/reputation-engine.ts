import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notifyAdminsClientMethodAuditAlert } from '@/lib/notifications/admin-events'

const BASE_SCORE = 50
const LONGEVITY_DAYS = 15
const EARLY_DROP_HOURS = 48
const SCORE_MIN = 0
const SCORE_MAX = 100
const NEGATIVE_LOCK_THRESHOLD = 3

function clampScore(value: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(value)))
}

function isUsoIndevido(text: string | null | undefined): boolean {
  if (!text) return false
  return /uso\s*indevido/i.test(text)
}

function diffDays(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

export async function recalculateCustomerScore(clientId: string) {
  const now = new Date()
  const profile = await prisma.clientProfile.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      reputationScore: true,
      averageAccountLifetimeDays: true,
      refundCount: true,
      plugPlayErrorCount: true,
      user: { select: { name: true, email: true } },
    },
  })
  if (!profile) return null

  const [plugPlayAccounts, replacementTickets] = await Promise.all([
    prisma.stockAccount.findMany({
      where: { clientId, isPlugPlay: true, deliveredAt: { not: null }, deletedAt: null },
      select: { id: true, deliveredAt: true },
    }),
    prisma.contestationTicket.findMany({
      where: {
        clientId,
        status: 'REPLACEMENT_APPROVED',
        account: { isPlugPlay: true },
      },
      include: {
        account: { select: { id: true, deliveredAt: true, isPlugPlay: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const replacementByAccount = new Map<string, Date>()
  let misuseCount = 0
  let earlyDropCount = 0
  for (const t of replacementTickets) {
    replacementByAccount.set(t.accountId, t.createdAt)
    if (isUsoIndevido(t.resolutionNotes)) {
      misuseCount += 1
      continue
    }
    const deliveredAt = t.account.deliveredAt
    if (deliveredAt) {
      const hours = (t.createdAt.getTime() - deliveredAt.getTime()) / (1000 * 60 * 60)
      if (hours <= EARLY_DROP_HOURS) earlyDropCount += 1
    }
  }

  let longevityCount = 0
  let latestPositiveDate: Date | null = null
  const lifetimes: number[] = []
  for (const acc of plugPlayAccounts) {
    const deliveredAt = acc.deliveredAt
    if (!deliveredAt) continue

    const replacementAt = replacementByAccount.get(acc.id)
    const endAt = replacementAt ?? now
    const lifeDays = Math.max(0, diffDays(endAt, deliveredAt))
    lifetimes.push(lifeDays)

    if (lifeDays >= LONGEVITY_DAYS && !replacementAt) {
      longevityCount += 1
      if (!latestPositiveDate || endAt > latestPositiveDate) latestPositiveDate = endAt
    }
  }

  let consecutiveErrors = 0
  for (const t of replacementTickets) {
    if (latestPositiveDate && t.createdAt <= latestPositiveDate) break
    consecutiveErrors += 1
  }

  const avgLifetime =
    lifetimes.length > 0 ? Math.round((lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length) * 100) / 100 : null
  const calculatedScore = clampScore(
    BASE_SCORE + longevityCount * 5 - misuseCount * 10 - earlyDropCount * 5
  )
  const changed =
    profile.reputationScore !== calculatedScore ||
    (profile.averageAccountLifetimeDays ?? null) !== avgLifetime ||
    profile.refundCount !== replacementTickets.length ||
    profile.plugPlayErrorCount !== consecutiveErrors

  if (changed) {
    await prisma.clientProfile.update({
      where: { id: clientId },
      data: {
        reputationScore: calculatedScore,
        averageAccountLifetimeDays: avgLifetime,
        refundCount: replacementTickets.length,
        plugPlayErrorCount: consecutiveErrors,
      },
    })

    await audit({
      action: 'customer_reputation_score_recalculated',
      entity: 'ClientProfile',
      entityId: clientId,
      details: {
        previous: {
          score: profile.reputationScore,
          averageAccountLifetimeDays: profile.averageAccountLifetimeDays,
          refundCount: profile.refundCount,
          plugPlayErrorCount: profile.plugPlayErrorCount,
        },
        current: {
          score: calculatedScore,
          averageAccountLifetimeDays: avgLifetime,
          refundCount: replacementTickets.length,
          plugPlayErrorCount: consecutiveErrors,
        },
        inputs: { longevityCount, misuseCount, earlyDropCount },
      },
    })
  }

  if (consecutiveErrors >= NEGATIVE_LOCK_THRESHOLD && profile.plugPlayErrorCount < NEGATIVE_LOCK_THRESHOLD) {
    const clientName = profile.user.name || profile.user.email || clientId
    await notifyAdminsClientMethodAuditAlert(clientName)
    await audit({
      action: 'customer_reputation_reverse_guarantee_lock',
      entity: 'ClientProfile',
      entityId: clientId,
      details: { plugPlayErrorCount: consecutiveErrors, threshold: NEGATIVE_LOCK_THRESHOLD },
    })
  }

  return {
    score: calculatedScore,
    averageAccountLifetimeDays: avgLifetime,
    refundCount: replacementTickets.length,
    plugPlayErrorCount: consecutiveErrors,
    blockedByReverseGuarantee: consecutiveErrors >= NEGATIVE_LOCK_THRESHOLD,
  }
}

export function isHighRiskScore(score: number | null | undefined): boolean {
  return (score ?? BASE_SCORE) < 50
}

export function isBlockedForPlugPlay(errorCount: number | null | undefined): boolean {
  return (errorCount ?? 0) >= NEGATIVE_LOCK_THRESHOLD
}

export function isG2PremiumLabel(accountType?: string | null, product?: string | null): boolean {
  const text = `${accountType || ''} ${product || ''}`.toUpperCase()
  return text.includes('G2') && (text.includes('PREMIUM') || text.includes('PLUG') || text.includes('ELITE'))
}
