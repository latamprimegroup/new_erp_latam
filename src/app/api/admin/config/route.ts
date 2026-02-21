import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const prodKeys = [
    'meta_producao_mensal', 'meta_vendas_mensal', 'bonus_nivel_1', 'bonus_nivel_2', 'bonus_nivel_3', 'bonus_nivel_max',
    'black_pagamento_por_conta_24h',
    'producao_salario_base', 'producao_meta_diaria', 'producao_meta_mensal', 'producao_meta_elite',
    'producao_bonus_200', 'producao_bonus_250', 'producao_bonus_300', 'producao_bonus_330', 'producao_bonus_600',
    'plugplay_salario_base', 'plugplay_meta_diaria', 'plugplay_meta_mensal', 'plugplay_meta_elite',
    'plugplay_bonus_bronze', 'plugplay_bonus_prata', 'plugplay_bonus_ouro', 'plugplay_bonus_meta', 'plugplay_bonus_elite',
  ]
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: prodKeys } },
  })

  const config = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return NextResponse.json({
    metaProducaoMensal: parseInt(config.meta_producao_mensal || '10000', 10),
    metaVendasMensal: parseInt(config.meta_vendas_mensal || '10000', 10),
    bonusNivel1: parseInt(config.bonus_nivel_1 || '200', 10),
    bonusNivel2: parseInt(config.bonus_nivel_2 || '250', 10),
    bonusNivel3: parseInt(config.bonus_nivel_3 || '300', 10),
    bonusNivelMax: parseInt(config.bonus_nivel_max || '330', 10),
    blackPagamentoPorConta24h: parseInt(config.black_pagamento_por_conta_24h || '50', 10),
    producaoSalarioBase: parseInt(config.producao_salario_base || '1500', 10),
    producaoMetaDiaria: parseInt(config.producao_meta_diaria || '15', 10),
    producaoMetaMensal: parseInt(config.producao_meta_mensal || '330', 10),
    producaoMetaElite: parseInt(config.producao_meta_elite || '600', 10),
    producaoBonus200: parseInt(config.producao_bonus_200 || '1000', 10),
    producaoBonus250: parseInt(config.producao_bonus_250 || '2000', 10),
    producaoBonus300: parseInt(config.producao_bonus_300 || '3000', 10),
    producaoBonus330: parseInt(config.producao_bonus_330 || '5000', 10),
    producaoBonus600: parseInt(config.producao_bonus_600 || '10000', 10),
    plugplaySalarioBase: parseInt(config.plugplay_salario_base || '2500', 10),
    plugplayMetaDiaria: parseInt(config.plugplay_meta_diaria || '15', 10),
    plugplayMetaMensal: parseInt(config.plugplay_meta_mensal || '330', 10),
    plugplayMetaElite: parseInt(config.plugplay_meta_elite || '600', 10),
    plugplayBonusBronze: parseInt(config.plugplay_bonus_bronze || '1000', 10),
    plugplayBonusPrata: parseInt(config.plugplay_bonus_prata || '2000', 10),
    plugplayBonusOuro: parseInt(config.plugplay_bonus_ouro || '3000', 10),
    plugplayBonusMeta: parseInt(config.plugplay_bonus_meta || '5000', 10),
    plugplayBonusElite: parseInt(config.plugplay_bonus_elite || '10000', 10),
  })
}

const updateSchema = z.object({
  metaProducaoMensal: z.number().int().min(1).optional(),
  metaVendasMensal: z.number().int().min(1).optional(),
  bonusNivel1: z.number().int().min(1).optional(),
  bonusNivel2: z.number().int().min(1).optional(),
  bonusNivel3: z.number().int().min(1).optional(),
  bonusNivelMax: z.number().int().min(1).optional(),
  blackPagamentoPorConta24h: z.number().int().min(0).optional(),
  producaoSalarioBase: z.number().int().min(0).optional(),
  producaoMetaDiaria: z.number().int().min(1).optional(),
  producaoMetaMensal: z.number().int().min(1).optional(),
  producaoMetaElite: z.number().int().min(1).optional(),
  producaoBonus200: z.number().int().min(0).optional(),
  producaoBonus250: z.number().int().min(0).optional(),
  producaoBonus300: z.number().int().min(0).optional(),
  producaoBonus330: z.number().int().min(0).optional(),
  producaoBonus600: z.number().int().min(0).optional(),
  plugplaySalarioBase: z.number().int().min(0).optional(),
  plugplayMetaDiaria: z.number().int().min(1).optional(),
  plugplayMetaMensal: z.number().int().min(1).optional(),
  plugplayMetaElite: z.number().int().min(1).optional(),
  plugplayBonusBronze: z.number().int().min(0).optional(),
  plugplayBonusPrata: z.number().int().min(0).optional(),
  plugplayBonusOuro: z.number().int().min(0).optional(),
  plugplayBonusMeta: z.number().int().min(0).optional(),
  plugplayBonusElite: z.number().int().min(0).optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const updates: Array<{ key: string; value: string }> = []
    if (data.metaProducaoMensal !== undefined) updates.push({ key: 'meta_producao_mensal', value: String(data.metaProducaoMensal) })
    if (data.metaVendasMensal !== undefined) updates.push({ key: 'meta_vendas_mensal', value: String(data.metaVendasMensal) })
    if (data.bonusNivel1 !== undefined) updates.push({ key: 'bonus_nivel_1', value: String(data.bonusNivel1) })
    if (data.bonusNivel2 !== undefined) updates.push({ key: 'bonus_nivel_2', value: String(data.bonusNivel2) })
    if (data.bonusNivel3 !== undefined) updates.push({ key: 'bonus_nivel_3', value: String(data.bonusNivel3) })
    if (data.bonusNivelMax !== undefined) updates.push({ key: 'bonus_nivel_max', value: String(data.bonusNivelMax) })
    if (data.blackPagamentoPorConta24h !== undefined) updates.push({ key: 'black_pagamento_por_conta_24h', value: String(data.blackPagamentoPorConta24h) })
    if (data.producaoSalarioBase !== undefined) updates.push({ key: 'producao_salario_base', value: String(data.producaoSalarioBase) })
    if (data.producaoMetaDiaria !== undefined) updates.push({ key: 'producao_meta_diaria', value: String(data.producaoMetaDiaria) })
    if (data.producaoMetaMensal !== undefined) updates.push({ key: 'producao_meta_mensal', value: String(data.producaoMetaMensal) })
    if (data.producaoMetaElite !== undefined) updates.push({ key: 'producao_meta_elite', value: String(data.producaoMetaElite) })
    if (data.producaoBonus200 !== undefined) updates.push({ key: 'producao_bonus_200', value: String(data.producaoBonus200) })
    if (data.producaoBonus250 !== undefined) updates.push({ key: 'producao_bonus_250', value: String(data.producaoBonus250) })
    if (data.producaoBonus300 !== undefined) updates.push({ key: 'producao_bonus_300', value: String(data.producaoBonus300) })
    if (data.producaoBonus330 !== undefined) updates.push({ key: 'producao_bonus_330', value: String(data.producaoBonus330) })
    if (data.producaoBonus600 !== undefined) updates.push({ key: 'producao_bonus_600', value: String(data.producaoBonus600) })
    if (data.plugplaySalarioBase !== undefined) updates.push({ key: 'plugplay_salario_base', value: String(data.plugplaySalarioBase) })
    if (data.plugplayMetaDiaria !== undefined) updates.push({ key: 'plugplay_meta_diaria', value: String(data.plugplayMetaDiaria) })
    if (data.plugplayMetaMensal !== undefined) updates.push({ key: 'plugplay_meta_mensal', value: String(data.plugplayMetaMensal) })
    if (data.plugplayMetaElite !== undefined) updates.push({ key: 'plugplay_meta_elite', value: String(data.plugplayMetaElite) })
    if (data.plugplayBonusBronze !== undefined) updates.push({ key: 'plugplay_bonus_bronze', value: String(data.plugplayBonusBronze) })
    if (data.plugplayBonusPrata !== undefined) updates.push({ key: 'plugplay_bonus_prata', value: String(data.plugplayBonusPrata) })
    if (data.plugplayBonusOuro !== undefined) updates.push({ key: 'plugplay_bonus_ouro', value: String(data.plugplayBonusOuro) })
    if (data.plugplayBonusMeta !== undefined) updates.push({ key: 'plugplay_bonus_meta', value: String(data.plugplayBonusMeta) })
    if (data.plugplayBonusElite !== undefined) updates.push({ key: 'plugplay_bonus_elite', value: String(data.plugplayBonusElite) })

    for (const u of updates) {
      await prisma.systemSetting.upsert({
        where: { key: u.key },
        create: u,
        update: { value: u.value },
      })
    }

    const prodKeys = [
      'meta_producao_mensal', 'meta_vendas_mensal', 'bonus_nivel_1', 'bonus_nivel_2', 'bonus_nivel_3', 'bonus_nivel_max',
      'black_pagamento_por_conta_24h',
      'producao_salario_base', 'producao_meta_diaria', 'producao_meta_mensal', 'producao_meta_elite',
      'producao_bonus_200', 'producao_bonus_250', 'producao_bonus_300', 'producao_bonus_330', 'producao_bonus_600',
      'plugplay_salario_base', 'plugplay_meta_diaria', 'plugplay_meta_mensal', 'plugplay_meta_elite',
      'plugplay_bonus_bronze', 'plugplay_bonus_prata', 'plugplay_bonus_ouro', 'plugplay_bonus_meta', 'plugplay_bonus_elite',
    ]
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: prodKeys } },
    })
    const config = Object.fromEntries(settings.map((s) => [s.key, s.value]))
    return NextResponse.json({
      metaProducaoMensal: parseInt(config.meta_producao_mensal || '10000', 10),
      metaVendasMensal: parseInt(config.meta_vendas_mensal || '10000', 10),
      bonusNivel1: parseInt(config.bonus_nivel_1 || '200', 10),
      bonusNivel2: parseInt(config.bonus_nivel_2 || '250', 10),
      bonusNivel3: parseInt(config.bonus_nivel_3 || '300', 10),
      bonusNivelMax: parseInt(config.bonus_nivel_max || '330', 10),
      blackPagamentoPorConta24h: parseInt(config.black_pagamento_por_conta_24h || '50', 10),
      producaoSalarioBase: parseInt(config.producao_salario_base || '1500', 10),
      producaoMetaDiaria: parseInt(config.producao_meta_diaria || '15', 10),
      producaoMetaMensal: parseInt(config.producao_meta_mensal || '330', 10),
      producaoMetaElite: parseInt(config.producao_meta_elite || '600', 10),
      producaoBonus200: parseInt(config.producao_bonus_200 || '1000', 10),
      producaoBonus250: parseInt(config.producao_bonus_250 || '2000', 10),
      producaoBonus300: parseInt(config.producao_bonus_300 || '3000', 10),
      producaoBonus330: parseInt(config.producao_bonus_330 || '5000', 10),
      producaoBonus600: parseInt(config.producao_bonus_600 || '10000', 10),
      plugplaySalarioBase: parseInt(config.plugplay_salario_base || '2500', 10),
      plugplayMetaDiaria: parseInt(config.plugplay_meta_diaria || '15', 10),
      plugplayMetaMensal: parseInt(config.plugplay_meta_mensal || '330', 10),
      plugplayMetaElite: parseInt(config.plugplay_meta_elite || '600', 10),
      plugplayBonusBronze: parseInt(config.plugplay_bonus_bronze || '1000', 10),
      plugplayBonusPrata: parseInt(config.plugplay_bonus_prata || '2000', 10),
      plugplayBonusOuro: parseInt(config.plugplay_bonus_ouro || '3000', 10),
      plugplayBonusMeta: parseInt(config.plugplay_bonus_meta || '5000', 10),
      plugplayBonusElite: parseInt(config.plugplay_bonus_elite || '10000', 10),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    throw err
  }
}
