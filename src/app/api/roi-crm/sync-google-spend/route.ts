import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const SOURCE = 'GOOGLE_ACCOUNT_LOGS'

/**
 * Agrega `AccountSpendLog.costMicros` por dia civil (UTC) de `periodStart` e grava em `ads_spend_daily`
 * com `source = GOOGLE_ACCOUNT_LOGS` (não sobrescreve lançamentos MANUAL do mesmo dia).
 *
 * Moeda: assume BRL nos micros (ajuste futuro: respeitar `currencyCode`).
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const role = session.user?.role
  if (role !== 'ADMIN' && role !== 'FINANCE') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 120)

  const logs = await prisma.accountSpendLog.findMany({
    where: { periodStart: { gte: since } },
    select: { periodStart: true, costMicros: true },
  })

  if (logs.length === 0) {
    return NextResponse.json({
      ok: true,
      code: 'NO_LOGS',
      message: 'Nenhum registro em account_spend_logs no período. Use sync de gastos nas contas ou POST /api/roi-crm/daily-spend.',
      upserted: 0,
    })
  }

  const byDay = new Map<string, number>()
  for (const row of logs) {
    const key = row.periodStart.toISOString().slice(0, 10)
    const brl = Number(row.costMicros) / 1_000_000
    byDay.set(key, (byDay.get(key) ?? 0) + brl)
  }

  let upserted = 0
  for (const [dateStr, amountBrl] of byDay) {
    const day = new Date(`${dateStr}T12:00:00.000Z`)
    await prisma.adsSpendDaily.upsert({
      where: {
        date_source: {
          date: day,
          source: SOURCE,
        },
      },
      create: {
        date: day,
        amountBrl,
        source: SOURCE,
        note: 'account_spend_logs (sync)',
      },
      update: {
        amountBrl,
        note: 'account_spend_logs (sync)',
      },
    })
    upserted += 1
  }

  return NextResponse.json({
    ok: true,
    code: 'SYNCED',
    upserted,
    days: Array.from(byDay.entries()).map(([data, amountBrl]) => ({ data, amountBrl })),
    hint: 'Valores somam apenas source GOOGLE_ACCOUNT_LOGS. Lançamentos MANUAL no mesmo dia somam no gráfico — evite duplicar o mesmo custo.',
  })
}
