import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  buildDreDailyRows,
  clampDeductionPct,
  getMentoradoOfferIds,
} from '@/lib/cliente/profit-board'

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
  return cell
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
    select: { id: true, clientCode: true },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const url = new URL(req.url)
  const monthRaw = url.searchParams.get('month')?.trim() || ''
  const m = /^(\d{4})-(\d{2})$/.exec(monthRaw)
  if (!m) {
    return NextResponse.json({ error: 'Use month=YYYY-MM' }, { status: 400 })
  }
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) {
    return NextResponse.json({ error: 'Mês inválido' }, { status: 400 })
  }

  const qpDed = url.searchParams.get('deductionPct')
  const deductionPct =
    qpDed != null && qpDed !== ''
      ? clampDeductionPct(qpDed)
      : clampDeductionPct(process.env.PROFIT_BOARD_DEFAULT_DEDUCTION_PCT ?? '0')

  const offerIds = await getMentoradoOfferIds(client.id)
  const rows = await buildDreDailyRows({
    clientId: client.id,
    offerIds,
    year,
    month,
    deductionPct,
  })

  const header = [
    'data',
    'receita_bruta_brl',
    'deducao_pct',
    'receita_liquida_brl',
    'gasto_creative_brl',
    'lucro_dia_brl',
  ]
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        csvEscape(r.date),
        r.grossRevenue.toFixed(2),
        deductionPct.toFixed(2),
        r.netRevenue.toFixed(2),
        r.spend.toFixed(2),
        r.netProfit.toFixed(2),
      ].join(','),
    ),
  ]

  const totalGross = rows.reduce((a, r) => a + r.grossRevenue, 0)
  const totalNetRev = rows.reduce((a, r) => a + r.netRevenue, 0)
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0)
  const totalProfit = rows.reduce((a, r) => a + r.netProfit, 0)

  lines.push('')
  lines.push(
    [
      'TOTAL_MES',
      totalGross.toFixed(2),
      deductionPct.toFixed(2),
      totalNetRev.toFixed(2),
      totalSpend.toFixed(2),
      totalProfit.toFixed(2),
    ].join(','),
  )

  const label = client.clientCode || client.id.slice(0, 8)
  const filename = `dre-profit-board_${label}_${year}-${String(month).padStart(2, '0')}.csv`
  const body = '\uFEFF' + lines.join('\n')

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
