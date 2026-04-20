import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { monthRange, dreVaultDemonstrativo } from '@/lib/vault-intelligence'

const ROLES = ['ADMIN', 'FINANCE'] as const

function csvEscape(s: string) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Exportação para contabilidade: lançamentos do mês + resumo DRE Vault (sem dados sensíveis de clientes). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1), 10)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
  const format = (searchParams.get('format') || 'csv').toLowerCase()
  const range = monthRange(year, month)

  const [entries, dre] = await Promise.all([
    prisma.financialEntry.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      orderBy: { date: 'asc' },
      take: 8000,
      select: {
        id: true,
        type: true,
        category: true,
        costCenter: true,
        value: true,
        date: true,
        orderId: true,
        reconciled: true,
        description: true,
      },
    }),
    dreVaultDemonstrativo(range),
  ])

  if (format === 'json') {
    return NextResponse.json({
      period: { month, year },
      dreVault: dre,
      lancamentos: entries.map((e) => ({
        ...e,
        value: e.value.toString(),
        date: e.date.toISOString(),
      })),
      nota: 'Notas fiscais: use cadastro externo ou integre modelo NF no próximo passo.',
    })
  }

  const lines: string[] = []
  lines.push(`# Ads Ativos — export contábil ${String(month).padStart(2, '0')}/${year}`)
  lines.push('# RESUMO_DRE_VAULT')
  lines.push('linha,valor')
  lines.push(`faturamento_bruto,${dre.faturamentoBruto}`)
  lines.push(`impostos_e_taxas,${dre.impostosETaxasCartao}`)
  lines.push(`custos_producao,${dre.custosProducaoInsumosPayouts}`)
  lines.push(`lucro_bruto,${dre.lucroBruto}`)
  lines.push(`despesas_operacionais,${dre.despesasOperacionais}`)
  lines.push(`lucro_liquido_real,${dre.lucroLiquidoReal}`)
  lines.push('')
  lines.push('# LANCAMENTOS')
  lines.push('data,tipo,categoria,valor,conciliado,order_id,centro_custo,descricao')

  for (const e of entries) {
    const row = [
      e.date.toISOString().slice(0, 10),
      e.type,
      csvEscape(e.category),
      e.value.toString(),
      e.reconciled ? '1' : '0',
      e.orderId || '',
      csvEscape(e.costCenter || ''),
      csvEscape((e.description || '').slice(0, 500)),
    ].join(',')
    lines.push(row)
  }

  const csv = lines.join('\n')
  const filename = `contabil_${year}_${String(month).padStart(2, '0')}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
