/**
 * Event Bus - Domain Events
 * Desacoplamento entre agregados (ex: Venda emitida -> Baixa estoque)
 */
export type DomainEvent = {
  type: string
  payload: unknown
  occurredAt: Date
  aggregateId?: string
}

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => void | Promise<void>

const handlers = new Map<string, EventHandler[][]>()

/** Registra handler para um tipo de evento */
export function subscribe(eventType: string, handler: EventHandler): void {
  const list = handlers.get(eventType) ?? []
  list.push(handler)
  handlers.set(eventType, list)
}

/** Publica evento - executa handlers assincronamente */
export async function publish<E extends DomainEvent>(event: E): Promise<void> {
  const list = handlers.get(event.type) ?? []
  const promises = list.map((h) => Promise.resolve(h(event as E)).catch(console.error))
  await Promise.all(promises)
}

/** Limpa handlers (útil para testes) */
export function clearHandlers(): void {
  handlers.clear()
}
