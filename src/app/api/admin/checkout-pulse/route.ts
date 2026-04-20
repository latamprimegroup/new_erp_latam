import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/api-auth'

const ROLES = ['ADMIN', 'FINANCE', 'COMMERCIAL'] as const

const STALE_APPROVED_H = parseInt(process.env.CHECKOUT_PULSE_STALE_APPROVED_HOURS || '48', 10) || 48
const STALE_WEBHOOK_H = parseInt(process.env.CHECKOUT_PULSE_STALE_WEBHOOK_HOURS || '96', 10) || 96

/**
 * GET — estado dos gateways (contingência multi-checkout)
 */
export async function GET() {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const now = Date.now()
  const rows = await prisma.checkoutGatewayPulse.findMany({ orderBy: { code: 'asc' } })

  return NextResponse.json({
    staleApprovedAfterHours: STALE_APPROVED_H,
    staleWebhookAfterHours: STALE_WEBHOOK_H,
    gateways: rows.map((g) => {
      const lastA = g.lastApprovedAt?.getTime()
      const lastW = g.lastWebhookAt?.getTime()
      const staleApproved =
        g.enabled &&
        !!lastW &&
        (!lastA || (now - lastA) / 3600000 > STALE_APPROVED_H)
      const staleWebhook = g.enabled && (!lastW || (now - lastW) / 3600000 > STALE_WEBHOOK_H)
      return {
        code: g.code,
        label: g.label,
        enabled: g.enabled,
        lastWebhookAt: g.lastWebhookAt?.toISOString() ?? null,
        lastApprovedAt: g.lastApprovedAt?.toISOString() ?? null,
        alertStaleApproved: staleApproved,
        alertStaleWebhook: staleWebhook,
      }
    }),
  })
}
