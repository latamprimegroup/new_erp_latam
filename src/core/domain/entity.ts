/**
 * Base Entity - Contrato para entidades de domínio
 * DDD + Clean Architecture
 * 
 * Em migração futura: id como UUID v7 (time-ordered)
 */
export interface BaseEntity {
  id: string
  tenantId: string
  createdAt: Date
  updatedAt: Date
  version: number
  deletedAt: Date | null
}

/** Dados mínimos para criação */
export interface BaseEntityCreate {
  tenantId: string
}
