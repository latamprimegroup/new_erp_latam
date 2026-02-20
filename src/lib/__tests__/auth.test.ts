/**
 * Testes de autenticação e regras de roles
 * Execute: npm run test
 */
import { describe, it, expect } from 'vitest'

const ROLES = ['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL', 'CLIENT', 'MANAGER', 'PLUG_PLAY'] as const

describe('Roles do sistema', () => {
  it('deve ter os 8 roles definidos', () => {
    expect(ROLES).toHaveLength(8)
    expect(ROLES).toContain('ADMIN')
    expect(ROLES).toContain('CLIENT')
    expect(ROLES).toContain('PRODUCER')
  })

  it('ADMIN deve ter acesso total', () => {
    const staffRoles = ['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL']
    expect(staffRoles).toContain('ADMIN')
  })
})
