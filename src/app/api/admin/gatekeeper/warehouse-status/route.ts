import { NextResponse } from 'next/server'
import { VaultGmailStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { GATEKEEPER_CROSSING_ERROR } from '@/lib/gatekeeper/errors'
import { gatekeeperAudit } from '@/lib/gatekeeper/audit-log'

function isSituacaoAtivaRf(label: string | null | undefined): boolean {
  return /^ativa$/i.test((label || '').trim())
}

/**
 * GET — Painel Almoxarifado: safras de Gmail, CNPJs ativos (situação RF), totais cofre.
 * Inclui referência à política de duplicidade (monitoramento / integração futura com agregador de logs).
 */
export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  gatekeeperAudit('WAREHOUSE_STATUS', 'Snapshot do cofre solicitado')

  const yearCutoff = new Date().getFullYear() - 10
  const [
    safraGroups,
    gmailsAvailable,
    gmailsInUse,
    totalGmails,
    gmailsVovoAvailable,
    cnpjRows,
    totalIds,
    totalCards,
  ] = await Promise.all([
    prisma.inventoryGmail.groupBy({
      by: ['gmailSafra'],
      where: {},
      _count: { _all: true },
    }),
    prisma.inventoryGmail.count({ where: { status: VaultGmailStatus.AVAILABLE } }),
    prisma.inventoryGmail.count({ where: { status: VaultGmailStatus.IN_USE } }),
    prisma.inventoryGmail.count(),
    prisma.inventoryGmail.count({
      where: {
        status: VaultGmailStatus.AVAILABLE,
        harvestYear: { lte: yearCutoff },
      },
    }),
    prisma.inventoryCnpj.findMany({ select: { situacaoRf: true } }),
    prisma.inventoryId.count(),
    prisma.inventoryCard.count(),
  ])

  const cnpjsAtivos = cnpjRows.filter((r) => isSituacaoAtivaRf(r.situacaoRf)).length

  const gmailSafraBadges = safraGroups
    .map((g) => ({
      safra: g.gmailSafra ?? '(sem safra)',
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    gmailSafraBadges,
    gmails: {
      available: gmailsAvailable,
      inUse: gmailsInUse,
      total: totalGmails,
      vovoAvailable: gmailsVovoAvailable,
    },
    cnpjs: {
      ativosRf: cnpjsAtivos,
      totalCofre: cnpjRows.length,
    },
    inventoryIds: totalIds,
    inventoryCards: totalCards,
    duplicateEntryPolicy: {
      httpStatus: 409,
      message: GATEKEEPER_CROSSING_ERROR,
      prismaUniqueViolationCode: 'P2002',
      notes:
        'Pré-check em uniqueness-guard (409) ou falha Prisma P2002 mapeada para a mesma mensagem crítica.',
    },
  })
}
