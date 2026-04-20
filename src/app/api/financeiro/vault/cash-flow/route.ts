import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { cashFlowSeries } from '@/lib/vault-intelligence'

const ROLES = ['ADMIN', 'FINANCE'] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const days = Math.min(90, Math.max(7, parseInt(req.nextUrl.searchParams.get('days') || '14', 10) || 14))
  const series = await cashFlowSeries(days)
  return NextResponse.json({ days, series })
}
