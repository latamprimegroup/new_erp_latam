/**
 * Relatório Diário Avançado — vendas, produção, meta e projeções
 * Para notificações push e dashboards administrativos
 */
import { prisma } from './prisma'
import { getMetasGlobais } from './metas-globais'
import { getProducerRanking } from './g2-agent'

export type RelatorioDiario = {
  data: string
  vendas: {
    contasHoje: number
    valorHoje: number
    pedidosHoje: number
    contasMes: number
    valorMes: number
    percentualMeta: number
    metaMensal: number
    faltamParaMeta: number
    ritmoNecessario: number
    noRitmo: boolean
  }
  producao: {
    contasHoje: number
    contasMes: number
    percentualMeta: number
    metaMensal: number
    faltamParaMeta: number
    ritmoNecessario: number
    diasRestantes: number
    projecaoFimMes: number
    metaEmRisco: boolean
    noRitmo: boolean
  }
  resumo: string
  ranking: { name: string | null; count: number; rank: number }[]
}

function getStartOfDay(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function getEndOfDay(d: Date) {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

function getStartOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function getEndOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
}

export async function getRelatorioDiarioCompleto(date?: Date): Promise<RelatorioDiario> {
  const now = date || new Date()
  const startOfDay = getStartOfDay(now)
  const endOfDay = getEndOfDay(now)
  const startOfMonth = getStartOfMonth(now)
  const endOfMonth = getEndOfMonth(now)
  const diasNoMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const diaAtual = now.getDate()
  const diasRestantes = Math.max(0, diasNoMes - diaAtual)

  const [{ metaProducao, metaVendas }, producaoHoje, producaoMes, vendasHoje, vendasMes] = await Promise.all([
    getMetasGlobais(),
    prisma.stockAccount.count({
      where: {
        source: { in: ['PRODUCTION', 'PRODUCTION_G2'] },
        createdAt: { gte: startOfDay, lte: endOfDay },
        deletedAt: null,
      },
    }),
    prisma.stockAccount.count({
      where: {
        source: { in: ['PRODUCTION', 'PRODUCTION_G2'] },
        createdAt: { gte: startOfMonth, lte: endOfMonth },
        deletedAt: null,
      },
    }),
    prisma.orderItem.aggregate({
      where: {
        order: {
          status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
          paidAt: { gte: startOfDay, lte: endOfDay },
        },
      },
      _sum: { quantity: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: {
        status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
        paidAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { value: true },
    }),
  ])

  const contasVendidasHoje = vendasHoje._sum.quantity ?? 0
  const pedidosHoje = await prisma.order.count({
    where: {
      status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
      paidAt: { gte: startOfDay, lte: endOfDay },
    },
  })

  const valorHoje = (
    await prisma.order.aggregate({
      where: {
        status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
        paidAt: { gte: startOfDay, lte: endOfDay },
      },
      _sum: { value: true },
    })
  )._sum.value ?? 0

  const valorMes = Number(vendasMes._sum.value ?? 0)

  const contasVendidasMesCount = (
    await prisma.orderItem.aggregate({
      where: {
        order: {
          status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
          paidAt: { gte: startOfMonth, lte: endOfMonth },
        },
      },
      _sum: { quantity: true },
    })
  )._sum.quantity ?? 0

  const percentualVendas = metaVendas > 0 ? (contasVendidasMesCount / metaVendas) * 100 : 0
  const faltamVendas = Math.max(0, metaVendas - contasVendidasMesCount)
  const ritmoVendasNecessario = diasRestantes > 0 ? Math.ceil(faltamVendas / diasRestantes) : 0
  const ritmoEsperadoVendas = metaVendas / diasNoMes
  const vendasEsperadaAteHoje = ritmoEsperadoVendas * diaAtual
  const noRitmoVendas = contasVendidasMesCount >= vendasEsperadaAteHoje * 0.9

  const percentualProducao = metaProducao > 0 ? (producaoMes / metaProducao) * 100 : 0
  const faltamProducao = Math.max(0, metaProducao - producaoMes)
  const ritmoProducaoNecessario = diasRestantes > 0 ? Math.ceil(faltamProducao / diasRestantes) : 0
  const ritmoDiarioMedio = diaAtual > 0 ? producaoMes / diaAtual : 0
  const projecaoFimMes = Math.round(producaoMes + ritmoDiarioMedio * diasRestantes)
  const metaEmRisco = projecaoFimMes < metaProducao * 0.95
  const ritmoEsperadoProducao = metaProducao / diasNoMes
  const producaoEsperadaAteHoje = ritmoEsperadoProducao * diaAtual
  const noRitmoProducao = producaoMes >= producaoEsperadaAteHoje * 0.9

  const ranking = await getProducerRanking()
  const rankingSimple = ranking.map((r) => ({ name: r.name, count: r.count, rank: r.rank }))

  const dataStr = now.toISOString().slice(0, 10)
  const resumo = montarResumoTexto({
    dataStr,
    producaoHoje,
    producaoMes,
    metaProducao,
    faltamProducao,
    ritmoProducaoNecessario,
    metaEmRisco,
    contasVendidasHoje,
    contasVendidasMesCount,
    metaVendas,
    valorHoje,
    valorMes,
    pedidosHoje,
  }, rankingSimple)

  return {
    data: dataStr,
    vendas: {
      contasHoje: contasVendidasHoje,
      valorHoje: Number(valorHoje),
      pedidosHoje,
      contasMes: contasVendidasMesCount,
      valorMes,
      percentualMeta: Math.round(percentualVendas * 10) / 10,
      metaMensal: metaVendas,
      faltamParaMeta: faltamVendas,
      ritmoNecessario: ritmoVendasNecessario,
      noRitmo: noRitmoVendas,
    },
    producao: {
      contasHoje: producaoHoje,
      contasMes: producaoMes,
      percentualMeta: Math.round(percentualProducao * 10) / 10,
      metaMensal: metaProducao,
      faltamParaMeta: faltamProducao,
      ritmoNecessario: ritmoProducaoNecessario,
      diasRestantes,
      projecaoFimMes,
      metaEmRisco,
      noRitmo: noRitmoProducao,
    },
    resumo,
    ranking: rankingSimple,
  }
}

function montarResumoTexto(
  p: {
  dataStr: string
  producaoHoje: number
  producaoMes: number
  metaProducao: number
  faltamProducao: number
  ritmoProducaoNecessario: number
  metaEmRisco: boolean
  contasVendidasHoje: number
  contasVendidasMesCount: number
  metaVendas: number
  valorHoje: number
  valorMes: number
  pedidosHoje: number
  },
  ranking: { name: string | null; count: number; rank: number }[]
): string {
  const parts: string[] = []

  parts.push(`📊 RELATÓRIO ${p.dataStr}`)
  parts.push('')
  parts.push('📦 PRODUÇÃO')
  const pctProd = p.metaProducao > 0 ? Math.round((p.producaoMes / p.metaProducao) * 100) : 0
  parts.push(`Hoje: ${p.producaoHoje} | Mês: ${p.producaoMes}/${p.metaProducao} (${pctProd}%)`)
  if (p.faltamProducao > 0) {
    parts.push(`Faltam ${p.faltamProducao} para a meta. Ritmo necessário: ${p.ritmoProducaoNecessario}/dia`)
    if (p.metaEmRisco) parts.push('⚠️ Meta em risco')
    else parts.push('✅ No ritmo')
  } else {
    parts.push('🎉 Meta de produção batida!')
  }
  parts.push('')
  parts.push('💰 VENDAS')
  parts.push(`Hoje: ${p.contasVendidasHoje} contas, ${p.pedidosHoje} pedidos, R$ ${p.valorHoje.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  parts.push(`Mês: ${p.contasVendidasMesCount}/${p.metaVendas} contas | R$ ${p.valorMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  if (ranking.length > 0) {
    parts.push('')
    parts.push('🏆 Top produtores')
    ranking.slice(0, 5).forEach((r) => {
      parts.push(`${r.rank}. ${r.name || '-'}: ${r.count} contas`)
    })
  }

  return parts.join('\n')
}

/**
 * Versão curta para push (título + corpo)
 */
export function formatarParaPush(rel: RelatorioDiario): { title: string; body: string } {
  const p = rel.producao
  const v = rel.vendas

  let title = `📊 Relatório ${rel.data}`
  const bodyParts: string[] = []

  bodyParts.push(`Produção: ${p.contasHoje} hoje | ${p.contasMes}/${p.metaMensal}`)
  if (p.faltamParaMeta > 0) {
    bodyParts.push(`Faltam ${p.faltamParaMeta} contas (${p.ritmoNecessario}/dia)`)
    if (p.metaEmRisco) bodyParts.push('⚠️ Meta em risco')
  }
  bodyParts.push(`Vendas: ${v.contasHoje} hoje | R$ ${v.valorHoje.toLocaleString('pt-BR')}`)
  bodyParts.push(`${v.contasMes}/${v.metaMensal} no mês`)

  return {
    title,
    body: bodyParts.join(' · '),
  }
}
