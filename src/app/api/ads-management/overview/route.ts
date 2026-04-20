import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'
import { isGoogleAdsConfigured } from '@/lib/google-ads'
import {
  enrichMccClients,
  isBadStatusForRecovery,
  isRecoveredStatus,
  listMccLinkedClients,
  type MccClientEnriched,
} from '@/lib/google-ads-mcc'

export const dynamic = 'force-dynamic'

function normGid(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

function buildSnapshotPayload(rows: MccClientEnriched[]) {
  const customers: Record<string, { statusLabel: string; name: string }> = {}
  for (const r of rows) {
    customers[r.googleCustomerId] = { statusLabel: r.statusLabel, name: r.descriptiveName }
  }
  return { customers }
}

function countRecovered(
  prev: Record<string, { statusLabel?: string }> | undefined,
  curr: Record<string, { statusLabel?: string }>
): number {
  if (!prev) return 0
  let n = 0
  for (const id of Object.keys(curr)) {
    const was = prev[id]?.statusLabel ?? ''
    const now = curr[id]?.statusLabel ?? ''
    if (isBadStatusForRecovery(was) && isRecoveredStatus(now)) n++
  }
  return n
}

async function loadOpenAppealCustomerIds(): Promise<Set<string>> {
  const tickets = await prisma.contestationTicket.findMany({
    where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
    select: { account: { select: { googleAdsCustomerId: true } } },
  })
  const set = new Set<string>()
  for (const t of tickets) {
    const g = normGid(t.account?.googleAdsCustomerId ?? undefined)
    if (g) set.add(g)
  }
  return set
}

async function syncContingencyLogs(rows: MccClientEnriched[]) {
  for (const r of rows) {
    const id = r.googleCustomerId
    const isBad = r.travado || r.caiu || r.statusLabel === 'SUSPENDED'
    const reason = r.travado
      ? 'SUSPENDED'
      : r.hasDisapprovedAd
        ? 'POLICY'
        : r.caiu
          ? 'ZERO_SPEND_OR_POLICY'
          : 'OTHER'
    const policyDetail = r.hasDisapprovedAd ? 'Anúncio com DISAPPROVED' : null

    if (isBad) {
      const open = await prisma.adsContingencyLog.findFirst({
        where: { googleCustomerId: id, recoveredAt: null },
        orderBy: { fellAt: 'desc' },
      })
      if (!open) {
        await prisma.adsContingencyLog.create({
          data: {
            googleCustomerId: id,
            fellAt: new Date(),
            reason,
            policyDetail,
            currentStatusLabel: r.statusLabel,
          },
        })
      } else {
        await prisma.adsContingencyLog.update({
          where: { id: open.id },
          data: { currentStatusLabel: r.statusLabel, policyDetail: policyDetail ?? open.policyDetail },
        })
      }
    } else {
      await prisma.adsContingencyLog.updateMany({
        where: { googleCustomerId: id, recoveredAt: null },
        data: { recoveredAt: new Date(), currentStatusLabel: r.statusLabel },
      })
    }
  }
}

export async function GET() {
  const auth = await requireRoles(['ADMIN', 'PRODUCTION_MANAGER'])
  if (!auth.ok) return auth.response

  if (!isGoogleAdsConfigured()) {
    return NextResponse.json({
      configured: false,
      message: 'Defina GOOGLE_ADS_* no servidor para ativar o MCC.',
      refreshedAt: new Date().toISOString(),
      stats: { total: 0, gastando: 0, vendendo: 0, travado: 0, caiu: 0 },
      recovery: { inContestation: 0, recoveredSinceLastSnapshot: 0 },
      customers: [],
      contingencyLog: [],
    })
  }

  const linked = await listMccLinkedClients()
  if (!linked) {
    return NextResponse.json(
      { error: 'Falha ao listar contas do MCC (verifique permissões e login_customer_id).' },
      { status: 502 }
    )
  }

  const enriched = (await enrichMccClients(linked)) ?? []
  const appealSet = await loadOpenAppealCustomerIds()

  let recoveredSinceLastSnapshot = 0
  try {
    const lastSnap = await prisma.adsMccSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { payload: true },
    })
    let prevCustomers: Record<string, { statusLabel?: string }> | undefined
    const p = lastSnap?.payload
    if (p && typeof p === 'object' && p !== null && 'customers' in p) {
      prevCustomers = (p as { customers: Record<string, { statusLabel?: string }> }).customers
    }

    const currPayload = buildSnapshotPayload(enriched)
    recoveredSinceLastSnapshot = countRecovered(prevCustomers, currPayload.customers)

    await prisma.adsMccSnapshot.create({
      data: { payload: currPayload as object },
    })

    await syncContingencyLogs(enriched)
  } catch (e) {
    console.error('ads-management overview persistence:', e)
  }

  const stats = {
    total: enriched.length,
    gastando: enriched.filter((r) => r.gastando).length,
    vendendo: enriched.filter((r) => r.vendendo).length,
    travado: enriched.filter((r) => r.travado).length,
    caiu: enriched.filter((r) => r.caiu).length,
  }

  const inContestation = enriched.filter((r) => r.travado && appealSet.has(r.googleCustomerId)).length

  let contingencyLog: Array<{
    id: string
    googleCustomerId: string
    fellAt: string
    reason: string
    policyDetail: string | null
    currentStatusLabel: string
    recoveredAt: string | null
    recoveryDurationHours: number | null
  }> = []

  try {
    const logs = await prisma.adsContingencyLog.findMany({
      orderBy: { fellAt: 'desc' },
      take: 80,
    })
    contingencyLog = logs.map((l) => {
      let recoveryDurationHours: number | null = null
      if (l.recoveredAt) {
        recoveryDurationHours = Math.round(
          (l.recoveredAt.getTime() - l.fellAt.getTime()) / (1000 * 60 * 60)
        )
      }
      return {
        id: l.id,
        googleCustomerId: l.googleCustomerId,
        fellAt: l.fellAt.toISOString(),
        reason: l.reason,
        policyDetail: l.policyDetail,
        currentStatusLabel: l.currentStatusLabel,
        recoveredAt: l.recoveredAt?.toISOString() ?? null,
        recoveryDurationHours,
      }
    })
  } catch {
    /* tabela opcional até migrar */
  }

  return NextResponse.json({
    configured: true,
    refreshedAt: new Date().toISOString(),
    stats,
    recovery: { inContestation, recoveredSinceLastSnapshot },
    customers: enriched.map((r) => ({
      googleCustomerId: r.googleCustomerId,
      descriptiveName: r.descriptiveName,
      statusLabel: r.statusLabel,
      isManager: r.isManager,
      impressions7d: r.impressions7d,
      conversions7d: r.conversions7d,
      costMicros7d: r.costMicros7d.toString(),
      hasDisapprovedAd: r.hasDisapprovedAd,
      travado: r.travado,
      caiu: r.caiu,
      gastando: r.gastando,
      vendendo: r.vendendo,
      hasOpenAppeal: appealSet.has(r.googleCustomerId),
    })),
    contingencyLog,
  })
}
