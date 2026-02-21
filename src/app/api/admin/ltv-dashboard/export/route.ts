/**
 * Exportação LTV – CSV
 * GET /api/admin/ltv-dashboard/export?format=csv
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function escapeCsv(val: string | number | boolean | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') || 'csv'
  const limit = Math.min(parseInt(searchParams.get('limit') || '5000', 10), 10000)
  const dataInicioStr = searchParams.get('dataInicio')
  const dataFimStr = searchParams.get('dataFim')
  const dataInicio = dataInicioStr ? new Date(dataInicioStr) : null
  const dataFim = dataFimStr ? new Date(dataFimStr) : null

  const refDate = new Date()
  refDate.setHours(0, 0, 0, 0)

  const where: { referenceDate: Date; dataPrimeiraCompra?: { gte?: Date; lte?: Date } } = {
    referenceDate: refDate,
  }
  if (dataInicio ?? dataFim) {
    const dp: { gte?: Date; lte?: Date } = {}
    if (dataInicio) dp.gte = dataInicio
    if (dataFim) dp.lte = dataFim
    if (Object.keys(dp).length > 0) where.dataPrimeiraCompra = dp
  }

  const metrics = await prisma.customerMetrics.findMany({
    where,
    include: {
      client: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
          country: true,
        },
      },
    },
    take: limit,
    orderBy: { revenueTotal: 'desc' },
  })

  if (format === 'csv') {
    const headers = [
      'clientId',
      'cliente',
      'email',
      'pais',
      'dataPrimeiraCompra',
      'receitaTotal',
      'custoTotal',
      'margemTotal',
      'ltvBruto',
      'ltvLiquido',
      'ltvReal',
      'ticketMedio',
      'frequenciaMensal',
      'tempoRelacionamentoDias',
      'diasSemCompra',
      'churnFlag',
      'churnProbability',
      'churnRisk',
      'segmento',
      'ltvProjetado3m',
      'ltvProjetado6m',
      'ltvProjetado12m',
      'cac',
      'ltvCacRatio',
      'paybackMeses',
      'scoreValor',
      'scoreRisco',
      'scoreFidelidade',
      'tipoConta',
      'moeda',
      'vendedorId',
    ]
    const rows = metrics.map((m) => [
      escapeCsv(m.clientId),
      escapeCsv(m.client?.user?.name ?? ''),
      escapeCsv(m.client?.user?.email ?? ''),
      escapeCsv(m.pais ?? m.client?.country ?? ''),
      escapeCsv(m.dataPrimeiraCompra?.toISOString().slice(0, 10) ?? ''),
      escapeCsv(Number(m.revenueTotal)),
      escapeCsv(Number(m.costTotal)),
      escapeCsv(Number(m.marginTotal)),
      escapeCsv(Number(m.ltvBruto)),
      escapeCsv(Number(m.ltvLiquido)),
      escapeCsv(Number(m.ltvReal)),
      escapeCsv(Number(m.ticketMedio)),
      escapeCsv(Number(m.frequenciaMensal)),
      escapeCsv(m.tempoRelacionamentoDias),
      escapeCsv(m.diasSemCompra),
      escapeCsv(m.churnFlag),
      escapeCsv(m.churnProbability != null ? Number(m.churnProbability) : null),
      escapeCsv(m.churnRisk),
      escapeCsv(m.segmento),
      escapeCsv(m.ltvProjetado3m != null ? Number(m.ltvProjetado3m) : null),
      escapeCsv(m.ltvProjetado6m != null ? Number(m.ltvProjetado6m) : null),
      escapeCsv(m.ltvProjetado12m != null ? Number(m.ltvProjetado12m) : null),
      escapeCsv(m.cac != null ? Number(m.cac) : null),
      escapeCsv(m.ltvCacRatio != null ? Number(m.ltvCacRatio) : null),
      escapeCsv(m.paybackMeses != null ? Number(m.paybackMeses) : null),
      escapeCsv(m.scoreValor),
      escapeCsv(m.scoreRisco),
      escapeCsv(m.scoreFidelidade),
      escapeCsv(m.tipoConta),
      escapeCsv(m.moeda),
      escapeCsv(m.vendedorId),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ltv-export-${refDate.toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({ metrics: metrics.map((m) => ({ ...m, client: m.client })) })
}
