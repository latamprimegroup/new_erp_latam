/**
 * Verificação de saldo de garantia (Inter) + elegibilidade VIP (LTV / reputação)
 * para reposição automática sem fila de aprovação manual.
 */

import type { PrismaClient } from '@prisma/client'
import { fetchBancoInterSaldoBrl } from '@/lib/banco-inter-saldo'
import { getReputationBadge, type ReputationBadge } from '@/lib/reputation'
import { audit } from '@/lib/audit'

export type RepositionReasonCode =
  | 'BLOQUEIO'
  | 'LIMITE_GASTO'
  | 'ERRO_ESTRUTURAL'
  | 'PROBLEMA_PERFIL'
  | 'OUTRO'

export type GarantiaVerificacao = {
  clienteId: string
  inter: {
    consultado: boolean
    saldoBrl: number | null
    ok: boolean
    motivo?: string
  }
  vip: {
    badge: ReputationBadge | null
    ltvRealBrl: number | null
    elegivelPorReputacao: boolean
    elegivelPorLtv: boolean
  }
  garantiaSaldoOk: boolean
  autoReposicaoPermitida: boolean
  motivoBloqueio?: string
}

function envNum(name: string, fallback: number): number {
  const v = process.env[name]?.trim()
  if (!v) return fallback
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  if (!v) return fallback
  return v === '1' || v === 'true' || v === 'yes'
}

/**
 * Avalia se o cliente pode ter reposição aprovada automaticamente.
 * @param quantity — quantidade de contas a repor (afeta piso de saldo quando GARANTIA_REPOSICAO_CUSTO_POR_UNIDADE_BRL > 0).
 */
export async function verificarGarantiaEReposicaoVip(
  db: PrismaClient,
  clientId: string,
  options?: { quantity?: number }
): Promise<GarantiaVerificacao> {
  const qty = Math.max(1, Math.floor(options?.quantity ?? 1))
  const ltvMin = envNum('VIP_AUTO_LTV_MIN_BRL', 8000)
  const saldoMinimo = envNum('GARANTIA_SALDO_MINIMO_BRL', 0)
  const custoPorUnidade = envNum('GARANTIA_REPOSICAO_CUSTO_POR_UNIDADE_BRL', 0)
  const ignorarInter = envBool('GARANTIA_IGNORAR_INTER_SE_INDISPONIVEL', true)

  const [profile, metrics] = await Promise.all([
    db.clientProfile.findUnique({
      where: { id: clientId },
      select: { reputationScore: true },
    }),
    db.customerMetrics.findUnique({
      where: { clientId },
      select: { ltvReal: true },
    }),
  ])

  const score = profile?.reputationScore ?? null
  const badge = getReputationBadge(score ?? undefined)
  const ltvRealBrl = metrics?.ltvReal != null ? Number(metrics.ltvReal) : null

  const elegivelPorReputacao = badge === 'VIP'
  const elegivelPorLtv = ltvRealBrl != null && ltvRealBrl >= ltvMin && badge !== 'HIGH_RISK'
  const clienteVipOuLtv = elegivelPorReputacao || elegivelPorLtv

  let interConsultado = false
  let saldoBrl: number | null = null
  let interOk = true
  let interMotivo: string | undefined

  const saldoApi = await fetchBancoInterSaldoBrl()
  if (saldoApi.ok) {
    interConsultado = true
    saldoBrl = saldoApi.balanceBrl
    const minNecessario = saldoMinimo + custoPorUnidade * qty
    interOk = saldoBrl >= minNecessario
    if (!interOk) {
      interMotivo = `Saldo Inter R$ ${saldoBrl.toFixed(2)} abaixo do mínimo configurado (R$ ${minNecessario.toFixed(2)}).`
    }
  } else {
    if (saldoApi.code === 'NOT_CONFIGURED') {
      interConsultado = false
      saldoBrl = null
      interOk = ignorarInter
      interMotivo = ignorarInter
        ? 'Inter não configurado — checagem de saldo ignorada (GARANTIA_IGNORAR_INTER_SE_INDISPONIVEL).'
        : 'Inter não configurado — configure credenciais ou habilite ignorar.'
    } else {
      interConsultado = true
      interOk = ignorarInter
      interMotivo = `${saldoApi.code}${saldoApi.detail ? `: ${saldoApi.detail}` : ''}`
      if (ignorarInter) {
        interMotivo += ' (ignorado por GARANTIA_IGNORAR_INTER_SE_INDISPONIVEL).'
      }
    }
  }

  const garantiaSaldoOk = interOk
  let autoReposicaoPermitida = clienteVipOuLtv && garantiaSaldoOk
  let motivoBloqueio: string | undefined

  if (!clienteVipOuLtv) {
    autoReposicaoPermitida = false
    motivoBloqueio =
      badge === 'HIGH_RISK'
        ? 'Cliente em perfil HIGH_RISK — reposição automática bloqueada.'
        : `Cliente fora do critério VIP (reputação ≥80 ou LTV real ≥ R$ ${ltvMin.toFixed(0)}).`
  } else if (!garantiaSaldoOk) {
    autoReposicaoPermitida = false
    motivoBloqueio = interMotivo || 'Saldo de garantia insuficiente.'
  }

  return {
    clienteId: clientId,
    inter: {
      consultado: interConsultado,
      saldoBrl,
      ok: garantiaSaldoOk,
      motivo: interMotivo,
    },
    vip: {
      badge,
      ltvRealBrl,
      elegivelPorReputacao,
      elegivelPorLtv,
    },
    garantiaSaldoOk,
    autoReposicaoPermitida,
    motivoBloqueio,
  }
}

export type AutoVipRepositionResult =
  | { ok: true; dryRun: true; verificacao: GarantiaVerificacao }
  | {
      ok: true
      dryRun: false
      reposition: { id: string }
      verificacao: GarantiaVerificacao
    }
  | { ok: false; status: number; error: string; verificacao?: GarantiaVerificacao }

/**
 * Cria reposição já APROVADA quando elegível (VIP/LTV + garantia Inter).
 */
export async function createAutoVipRepositionIfEligible(params: {
  db: PrismaClient
  deliveryId: string
  actorUserId: string
  quantity: number
  reason: RepositionReasonCode
  reasonOther?: string | null
  dryRun?: boolean
}): Promise<AutoVipRepositionResult> {
  const {
    db,
    deliveryId,
    actorUserId,
    quantity,
    reason,
    reasonOther = null,
    dryRun = false,
  } = params

  const delivery = await db.deliveryGroup.findUnique({
    where: { id: deliveryId },
    select: { id: true, clientId: true, quantityDelivered: true },
  })
  if (!delivery) {
    return { ok: false, status: 404, error: 'Entrega não encontrada' }
  }

  if (quantity > delivery.quantityDelivered) {
    return {
      ok: false,
      status: 400,
      error: 'Quantidade a repor não pode ser maior que a quantidade já entregue',
    }
  }

  const verificacao = await verificarGarantiaEReposicaoVip(db, delivery.clientId, { quantity })

  if (dryRun) {
    return { ok: true, dryRun: true, verificacao }
  }

  if (!verificacao.autoReposicaoPermitida) {
    return {
      ok: false,
      status: 403,
      error: verificacao.motivoBloqueio || 'Reposição automática não permitida',
      verificacao,
    }
  }

  const reposition = await db.deliveryReposition.create({
    data: {
      deliveryId,
      quantity,
      reason,
      reasonOther: reasonOther || null,
      status: 'APROVADA',
      analystId: actorUserId,
      resolvedAt: new Date(),
      notes: 'AUTO_VIP_GARANTIA',
    },
  })

  await db.deliveryGroup.update({
    where: { id: deliveryId },
    data: { status: 'EM_REPOSICAO' },
  })

  await db.deliveryGroupLog.create({
    data: {
      deliveryId,
      userId: actorUserId,
      action: 'reposition_auto_vip_approved',
      entity: 'DeliveryReposition',
      entityId: reposition.id,
      details: {
        quantity,
        reason,
        verificacao: {
          saldoBrl: verificacao.inter.saldoBrl,
          badge: verificacao.vip.badge,
          ltvRealBrl: verificacao.vip.ltvRealBrl,
        },
      },
    },
  })

  await audit({
    userId: actorUserId,
    action: 'reposition_auto_vip_approved',
    entity: 'DeliveryReposition',
    entityId: reposition.id,
    details: { deliveryId, clientId: delivery.clientId, quantity },
  })

  return { ok: true, dryRun: false, reposition: { id: reposition.id }, verificacao }
}
