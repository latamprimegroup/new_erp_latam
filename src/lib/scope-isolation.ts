/**
 * Padrões de isolamento multi-usuário (OS Contingência).
 * Use em queries Prisma: produtor só enxerga producerId = self; cliente só clientId = self.
 */

export function scopeProductionAccountsForUser(role: string | undefined, userId: string, producerIdFilter?: string) {
  if (role === 'PRODUCER') {
    return { producerId: userId }
  }
  if (producerIdFilter && (role === 'ADMIN' || role === 'PRODUCTION_MANAGER')) {
    return { producerId: producerIdFilter }
  }
  return {}
}

export function scopeClientProfileUserId(clientProfileId: string) {
  return { id: clientProfileId }
}
