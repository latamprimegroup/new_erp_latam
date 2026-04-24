/**
 * Middleware de Privacidade de Ativos — Double-Blind
 *
 * PURCHASING / ADMIN        → vê todos os dados (vendorId, costPrice, rawData, vendorRef)
 * PRODUCTION_MANAGER        → vê custo e fornecedor, mas NÃO vê rawData (credenciais brutas)
 * COMMERCIAL                → vê dados comerciais (adsId, salePrice, displayName, specs, tags)
 * Demais                    → somente dados públicos (sem preço de custo e sem fornecedor)
 */

type Role = string

/** Campos que NUNCA saem para roles não autorizadas */
const VENDOR_FIELDS = ['vendorId', 'costPrice', 'vendorRef', 'rawData', 'vendor'] as const

/** Campos bloqueados para PRODUCTION_MANAGER (vê custo/vendor, não vê credenciais) */
const RAW_ONLY_FIELDS = ['rawData'] as const

/** Aplica a máscara de privacidade num único ativo */
export function maskAsset<T extends Record<string, unknown>>(asset: T, role: Role): T {
  if (role === 'ADMIN' || role === 'PURCHASING') return asset

  // Gerente de Produção vê fornecedor e custo, mas não as credenciais brutas
  if (role === 'PRODUCTION_MANAGER') {
    const masked = { ...asset } as Record<string, unknown>
    for (const f of RAW_ONLY_FIELDS) delete masked[f]
    return masked as T
  }

  const masked = { ...asset } as Record<string, unknown>
  for (const f of VENDOR_FIELDS) delete masked[f]
  return masked as T
}

/** Aplica a máscara em lista de ativos */
export function maskAssets<T extends Record<string, unknown>>(assets: T[], role: Role): T[] {
  return assets.map((a) => maskAsset(a, role))
}

/** Quais roles podem ver dados de fornecedor (custo, vendorId) */
export function canSeeSensitiveData(role: Role): boolean {
  return role === 'ADMIN' || role === 'PURCHASING' || role === 'PRODUCTION_MANAGER'
}

/** Roles com acesso de leitura ao módulo de compras */
export const COMPRAS_READ_ROLES  = ['ADMIN', 'PURCHASING', 'COMMERCIAL', 'FINANCE', 'PRODUCTION_MANAGER']
/** Roles com acesso de escrita/criação de ativos */
export const COMPRAS_WRITE_ROLES = ['ADMIN', 'PURCHASING']
