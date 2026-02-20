import { prisma } from './prisma'

/**
 * Gera número sequencial do grupo: GR-0001, GR-0002, ...
 */
export async function generateGroupNumber(): Promise<string> {
  const count = await prisma.deliveryGroup.count()
  const next = count + 1
  return `GR-${String(next).padStart(4, '0')}`
}

/**
 * Calcula quantidade pendente
 */
export function quantityPending(contracted: number, delivered: number): number {
  return Math.max(0, contracted - delivered)
}

/**
 * Define status automático baseado em quantidade e prazos
 */
export function computeDeliveryStatus(
  quantityContracted: number,
  quantityDelivered: number,
  expectedCompletionAt: Date | null,
  hasActiveReposition: boolean
): 'AGUARDANDO_INICIO' | 'EM_ANDAMENTO' | 'PARCIALMENTE_ENTREGUE' | 'FINALIZADA' | 'ATRASADA' | 'EM_REPOSICAO' | 'CANCELADA' {
  if (hasActiveReposition) return 'EM_REPOSICAO'

  const pending = quantityContracted - quantityDelivered
  const now = new Date()

  if (quantityDelivered === 0) {
    if (expectedCompletionAt && expectedCompletionAt < now) return 'ATRASADA'
    return 'AGUARDANDO_INICIO'
  }

  if (pending <= 0) return 'FINALIZADA'

  if (expectedCompletionAt && expectedCompletionAt < now) return 'ATRASADA'
  if (quantityDelivered > 0 && pending > 0) return 'PARCIALMENTE_ENTREGUE'

  return 'EM_ANDAMENTO'
}
