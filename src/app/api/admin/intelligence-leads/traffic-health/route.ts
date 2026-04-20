import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { evaluateTrafficHealthAndAlerts } from '@/lib/lead-ingest-pulse'
import { processCheckoutRescueTimeouts } from '@/lib/intelligence-checkout-rescue'

const ROLES = ['ADMIN', 'FINANCE', 'COMMERCIAL'] as const

/**
 * GET — saúde do tráfego (pulses), alertas e processamento de resgates de carrinho.
 * O dashboard deve fazer poll periódico; Telegram dispara com cooldown se configurado.
 */
export async function GET() {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  let rescue = { flagged: 0 }
  try {
    rescue = await processCheckoutRescueTimeouts()
  } catch {
    /* opcional */
  }

  const health = await evaluateTrafficHealthAndAlerts()

  return NextResponse.json({
    ...health,
    checkoutRescueFlagged: rescue.flagged,
  })
}
