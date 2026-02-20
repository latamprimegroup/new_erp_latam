/**
 * Metas globais mensais: 10.000 produção e 10.000 vendas
 * Funções para cálculo de ritmo necessário e progresso
 */

import { prisma } from './prisma'

const DEFAULT_META_PRODUCAO = 10_000
const DEFAULT_META_VENDAS = 10_000

export type MetasGlobaisResult = {
  metaProducao: number
  metaVendas: number
  producaoAtual: number
  vendasAtual: number
  percentualProducao: number
  percentualVendas: number
  diasNoMes: number
  diaAtual: number
  diasRestantes: number
  ritmoProducaoNecessario: number
  ritmoVendasNecessario: number
  noRitmoProducao: boolean
  noRitmoVendas: boolean
  alertaProducao: boolean
  alertaVendas: boolean
}

async function getSetting(key: string, defaultValue: number): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key } })
  if (!s) return defaultValue
  const n = parseInt(s.value, 10)
  return isNaN(n) ? defaultValue : n
}

export async function getMetasGlobais(): Promise<{
  metaProducao: number
  metaVendas: number
}> {
  const [metaProducao, metaVendas] = await Promise.all([
    getSetting('meta_producao_mensal', DEFAULT_META_PRODUCAO),
    getSetting('meta_vendas_mensal', DEFAULT_META_VENDAS),
  ])
  return { metaProducao, metaVendas }
}

export async function setMetasGlobais(metaProducao: number, metaVendas: number) {
  await prisma.$transaction([
    prisma.systemSetting.upsert({
      where: { key: 'meta_producao_mensal' },
      create: { key: 'meta_producao_mensal', value: String(metaProducao) },
      update: { value: String(metaProducao) },
    }),
    prisma.systemSetting.upsert({
      where: { key: 'meta_vendas_mensal' },
      create: { key: 'meta_vendas_mensal', value: String(metaVendas) },
      update: { value: String(metaVendas) },
    }),
  ])
}

/**
 * Calcula progresso, ritmo necessário e alertas
 */
export async function calcularMetasMensais(): Promise<MetasGlobaisResult> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const diasNoMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const diaAtual = now.getDate()
  const diasRestantes = Math.max(0, diasNoMes - diaAtual) + (now.getHours() < 23 ? 0.5 : 0)

  const [{ metaProducao, metaVendas }, producaoAtual, vendasResult] = await Promise.all([
    getMetasGlobais(),
    prisma.productionAccount.count({
      where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    prisma.orderItem.aggregate({
      where: {
        order: {
          status: { in: ['PAID', 'IN_SEPARATION', 'IN_DELIVERY', 'DELIVERED'] },
          paidAt: { gte: startOfMonth, lte: endOfMonth },
        },
      },
      _sum: { quantity: true },
    }),
  ])

  const vendasAtual = vendasResult._sum.quantity ?? 0
  const percentualProducao = metaProducao > 0 ? (producaoAtual / metaProducao) * 100 : 0
  const percentualVendas = metaVendas > 0 ? (vendasAtual / metaVendas) * 100 : 0

  const ritmoProducaoNecessario =
    diasRestantes > 0 ? Math.ceil((metaProducao - producaoAtual) / diasRestantes) : 0
  const ritmoVendasNecessario =
    diasRestantes > 0 ? Math.ceil((metaVendas - vendasAtual) / diasRestantes) : 0

  const ritmoEsperadoProducao = metaProducao / diasNoMes
  const ritmoEsperadoVendas = metaVendas / diasNoMes
  const producaoEsperadaAteHoje = ritmoEsperadoProducao * diaAtual
  const vendasEsperadaAteHoje = ritmoEsperadoVendas * diaAtual

  const noRitmoProducao = producaoAtual >= producaoEsperadaAteHoje * 0.9
  const noRitmoVendas = vendasAtual >= vendasEsperadaAteHoje * 0.9

  const alertaProducao = percentualProducao < 80 && diaAtual >= 15
  const alertaVendas = percentualVendas < 80 && diaAtual >= 15

  return {
    metaProducao,
    metaVendas,
    producaoAtual,
    vendasAtual,
    percentualProducao,
    percentualVendas,
    diasNoMes,
    diaAtual,
    diasRestantes,
    ritmoProducaoNecessario,
    ritmoVendasNecessario,
    noRitmoProducao,
    noRitmoVendas,
    alertaProducao,
    alertaVendas,
  }
}

/**
 * Inicializa metas padrão se não existirem (útil no primeiro deploy)
 */
export async function initMetasPadrao() {
  const exist = await prisma.systemSetting.findFirst({
    where: { key: 'meta_producao_mensal' },
  })
  if (!exist) {
    await setMetasGlobais(DEFAULT_META_PRODUCAO, DEFAULT_META_VENDAS)
  }
}
