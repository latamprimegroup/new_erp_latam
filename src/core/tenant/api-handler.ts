/**
 * Wrapper para API handlers com tenant context
 * Extrai X-Tenant-Id do header e executa dentro de runWithTenant
 */
import { runWithTenant } from './context'

const DEFAULT_TENANT = 'ads-ativos'

/** Header esperado para multi-tenancy */
export const TENANT_HEADER = 'x-tenant-id'

export function getTenantFromRequest(req: Request): string {
  return req.headers.get(TENANT_HEADER) ?? DEFAULT_TENANT
}

/**
 * Executa handler com tenant no contexto.
 * Uso: export const GET = withTenant(async (req) => { ... })
 */
export function withTenant<T>(
  handler: (req: Request, context?: { params?: unknown }) => Promise<T> | T
) {
  return async (req: Request, context?: { params?: unknown }) => {
    const tenantId = getTenantFromRequest(req)
    return runWithTenant(tenantId, () => handler(req, context))
  }
}
