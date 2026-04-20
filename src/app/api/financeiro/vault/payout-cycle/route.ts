import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import {
  getOrOpenProducerVaultCycle,
  computeLiveProducerProvision,
  closeProducerVaultCycle,
  getCommissionDetailLog,
} from '@/lib/vault-producer-cycle'

/**
 * Extrato em tempo real + liquidação de ciclo (Francielle/Gustavo — base produção G1/G2).
 * PRODUCER: próprio usuário. ADMIN: query ?userId=
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = session.user?.role
  const paramUserId = req.nextUrl.searchParams.get('userId')
  let userId = session.user.id

  if (role === 'ADMIN' && paramUserId?.trim()) {
    userId = paramUserId.trim()
  } else if (role !== 'ADMIN' && role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  } else if (role === 'PRODUCER' && paramUserId && paramUserId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const cycle = await getOrOpenProducerVaultCycle(userId)
  const live = await computeLiveProducerProvision(userId, cycle.openedAt)
  const commissionLog = await getCommissionDetailLog(userId, cycle.openedAt)

  return NextResponse.json({
    userId,
    cycle: {
      id: cycle.id,
      openedAt: cycle.openedAt.toISOString(),
      status: cycle.status,
    },
    live: {
      unitsProduction: live.unitsProduction,
      unitsElite: live.unitsElite,
      provisionedProduction: live.provisionedProduction.toString(),
      provisionedElite: live.provisionedElite.toString(),
      total: live.total.toString(),
      config: live.config,
    },
    commissionLog: {
      lines: commissionLog.lines,
      subtotalBase: commissionLog.subtotalBase,
      subtotalElite: commissionLog.subtotalElite,
      total: commissionLog.total,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = session.user?.role
  let body: { userId?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  let userId = session.user.id
  if (role === 'ADMIN' && body.userId?.trim()) {
    userId = body.userId.trim()
  } else if (role !== 'ADMIN' && role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  } else if (role === 'PRODUCER' && body.userId && body.userId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const result = await closeProducerVaultCycle(userId, session.user.id)
  return NextResponse.json({ ok: true, ...result })
}
