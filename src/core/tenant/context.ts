/**
 * Tenant Context - Multi-tenancy
 * tenant_id extraído do header X-Tenant-Id
 */
import { AsyncLocalStorage } from 'async_hooks'

const tenantStorage = new AsyncLocalStorage<string>()

/** Define tenant para o escopo da requisição */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run(tenantId, fn)
}

/** Obtém tenant atual (lança se não definido) */
export function getTenantId(): string {
  const id = tenantStorage.getStore()
  if (!id) {
    throw new Error('Tenant não definido. Garanta X-Tenant-Id no header ou runWithTenant().')
  }
  return id
}

/** Obtém tenant atual ou null */
export function getTenantIdOrNull(): string | null {
  return tenantStorage.getStore() ?? null
}
