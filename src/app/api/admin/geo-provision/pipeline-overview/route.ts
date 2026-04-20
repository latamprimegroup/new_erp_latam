import { NextResponse } from 'next/server'
import { VaultGmailStatus, VaultIndustrialUnitStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { checkAdsPowerLocalApi } from '@/lib/geo-provision/adspower-industrial'

/**
 * GET — Visão Módulo 02: cofre (Módulo 01) × esteira UNI × pool de proxies × saúde AdsPower local.
 */
export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const [
    cofreGmailsAvailable,
    cofreCnpjs,
    cofreIdentities,
    cofreCards,
    uniDraft,
    uniProvisioning,
    uniReadyForWarmup,
    uniFailed,
    proxyPoolActive,
    adsPowerOk,
  ] = await Promise.all([
    prisma.inventoryGmail.count({ where: { status: VaultGmailStatus.AVAILABLE } }),
    prisma.inventoryCnpj.count(),
    prisma.inventoryId.count(),
    prisma.inventoryCard.count(),
    prisma.vaultIndustrialUnit.count({ where: { status: VaultIndustrialUnitStatus.DRAFT } }),
    prisma.vaultIndustrialUnit.count({ where: { status: VaultIndustrialUnitStatus.PROVISIONING } }),
    prisma.vaultIndustrialUnit.count({ where: { status: VaultIndustrialUnitStatus.READY_FOR_WARMUP } }),
    prisma.vaultIndustrialUnit.count({ where: { status: VaultIndustrialUnitStatus.FAILED } }),
    prisma.geoProxyPoolEntry.count({ where: { active: true } }),
    checkAdsPowerLocalApi(),
  ])

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    adsPowerLocalApiReachable: adsPowerOk,
    cofre: {
      gmailsAvailable: cofreGmailsAvailable,
      cnpjs: cofreCnpjs,
      identities: cofreIdentities,
      cards: cofreCards,
    },
    uni: {
      draft: uniDraft,
      provisioning: uniProvisioning,
      readyForWarmup: uniReadyForWarmup,
      failed: uniFailed,
      total: uniDraft + uniProvisioning + uniReadyForWarmup + uniFailed,
    },
    proxyPool: { activeEntries: proxyPoolActive },
    labels: {
      cofre: 'Matéria-prima no cofre (Módulo 01)',
      readyForWarmup: 'UNIs com perfil AdsPower criado — maturação / handoff operacional',
      failed: 'UNIs com erro na esteira (ver provision_error)',
    },
  })
}
