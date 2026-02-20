/**
 * Radar de Destruição de Lucro
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { detectProfitDestroyers } from '@/lib/profit-engine/profit-destruction-radar'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const destroyers = await detectProfitDestroyers()
  return NextResponse.json({ destroyers })
}
