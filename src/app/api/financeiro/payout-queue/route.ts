import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import {
  getOrOpenProducerVaultCycle,
  computeLiveProducerProvision,
  closeProducerVaultCycle,
} from '@/lib/vault-producer-cycle'

const ROLES = ['ADMIN', 'FINANCE'] as const

/** Fila de folha: produtores com provisão acumulada no ciclo aberto (visão financeiro). */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const producers = await prisma.user.findMany({
    where: { role: 'PRODUCER' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  const items = await Promise.all(
    producers.map(async (u) => {
      const cycle = await getOrOpenProducerVaultCycle(u.id)
      const live = await computeLiveProducerProvision(u.id, cycle.openedAt)
      return {
        userId: u.id,
        name: u.name || u.email,
        email: u.email,
        cycleId: cycle.id,
        openedAt: cycle.openedAt.toISOString(),
        unitsProduction: live.unitsProduction,
        unitsElite: live.unitsElite,
        provisionedProduction: live.provisionedProduction.toString(),
        provisionedElite: live.provisionedElite.toString(),
        total: live.total.toString(),
        totalNumber: live.total.toNumber(),
      }
    })
  )

  return NextResponse.json({ producers: items })
}

const liquidateSchema = z.object({
  userId: z.string().min(1),
  /** Se false, só fecha o ciclo e gera comprovante sem lançar despesa (raro) */
  registerExpense: z.boolean().optional().default(true),
})

/**
 * Liquidar pagamento: fecha ciclo Vault do produtor, gera comprovante (JSON) e opcionalmente lança despesa FOLHA_PRODUCAO.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = liquidateSchema.parse(await req.json())
    const user = await prisma.user.findFirst({
      where: { id: body.userId, role: 'PRODUCER' },
      select: { id: true, name: true, email: true },
    })
    if (!user) return NextResponse.json({ error: 'Produtor não encontrado' }, { status: 404 })

    const result = await closeProducerVaultCycle(user.id, session.user.id)
    const report = result.report as {
      total: number
      commissionLines?: unknown[]
      [key: string]: unknown
    }
    const amount = Number(report.total ?? 0)

    let expenseId: string | null = null
    if (body.registerExpense && amount > 0) {
      const entry = await prisma.financialEntry.create({
        data: {
          type: 'EXPENSE',
          category: 'FOLHA_PRODUCAO',
          value: amount,
          date: new Date(),
          costCenter: user.id,
          description: `Folha produtor ${user.name || user.email} — ciclo ${result.previousCycleId} (${report.unitsProduction ?? 0} un. + elite)`,
        },
      })
      expenseId = entry.id
    }

    const comprovante = {
      emittedAt: new Date().toISOString(),
      liquidadoPor: session.user.email || session.user.id,
      produtor: { id: user.id, nome: user.name, email: user.email },
      cicloFechadoId: result.previousCycleId,
      valorTotal: amount,
      detalhe: report,
      despesaLancadaId: expenseId,
    }

    await audit({
      userId: session.user.id,
      action: 'financeiro_payout_liquidado',
      entity: 'ProducerVaultCycle',
      entityId: result.previousCycleId,
      details: { userId: user.id, amount, expenseId },
    })

    return NextResponse.json({ ok: true, comprovante, expenseId })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Inválido' }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : 'Erro'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
