import type { PrismaClient } from '@prisma/client'

export function formatAdsCoreProcessedAt(d: Date): string {
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export async function getUserDisplayName(
  prisma: PrismaClient,
  userId: string | null | undefined
): Promise<string> {
  if (!userId) return '—'
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  })
  return (u?.name || u?.email || 'Produtor').trim()
}

/** Bloqueia novo cadastro se o CNPJ já constar no registro (ativo excluído no passado). */
export async function assertCnpjAvailableForNewAsset(
  prisma: PrismaClient,
  cnpj: string
): Promise<{ blocked: true; message: string } | { blocked: false }> {
  const row = await prisma.adsCoreCnpjRegistry.findUnique({
    where: { cnpj },
  })
  if (!row) return { blocked: false }
  const name = row.producerName || 'um produtor'
  const when = formatAdsCoreProcessedAt(row.processedAt)
  const extra =
    row.blockReason && String(row.blockReason).trim()
      ? ` Motivo: ${String(row.blockReason).trim()}`
      : row.source === 'REPROVADO'
        ? ' (CNPJ em arquivo de reprovação.)'
        : ''
  return {
    blocked: true,
    message: `Este CNPJ já foi utilizado anteriormente por ${name}. Não é permitido recadastrar para outro colaborador.${extra ? ` (${when})${extra}` : ''}`,
  }
}

/** Ao excluir ativo, preserva rastro para bloquear reutilização futura do CNPJ. */
export async function touchCnpjRegistryOnDelete(
  prisma: PrismaClient,
  cnpj: string,
  producerId: string | null,
  producerName: string
) {
  await prisma.adsCoreCnpjRegistry.upsert({
    where: { cnpj },
    create: {
      cnpj,
      producerId,
      producerName,
      processedAt: new Date(),
      source: 'DELETE',
    },
    update: {
      producerId,
      producerName,
      processedAt: new Date(),
      source: 'DELETE',
    },
  })
}

/** Marca CNPJ no registro com motivo de reprovação (reforço pós-exclusão / política de reuso). */
export async function tagCnpjRegistryRejection(
  prisma: PrismaClient,
  cnpj: string,
  producerId: string | null,
  producerName: string,
  reason: string
) {
  const r = reason.trim().slice(0, 500)
  await prisma.adsCoreCnpjRegistry.upsert({
    where: { cnpj },
    create: {
      cnpj,
      producerId,
      producerName,
      processedAt: new Date(),
      source: 'REPROVADO',
      blockReason: r || null,
    },
    update: {
      producerId,
      producerName,
      processedAt: new Date(),
      source: 'REPROVADO',
      blockReason: r || null,
    },
  })
}
