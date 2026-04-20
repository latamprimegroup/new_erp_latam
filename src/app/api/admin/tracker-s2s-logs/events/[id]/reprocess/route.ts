import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { reprocessTrackerSaleSignal } from '@/lib/ads-tracker/reprocess-sale-signal'

const WRITE_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...WRITE_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const r = await reprocessTrackerSaleSignal(id)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
