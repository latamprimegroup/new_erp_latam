import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    // Não passar datasources explicitamente — Prisma lê DATABASE_URL do env automaticamente.
    // Passar url: undefined causa PrismaClientConstructorValidationError durante o build no Vercel.
  })

// Reutiliza a instância em todos os ambientes (crítico no serverless/Vercel)
// Sem isso cada request cria um novo pool e esgota max_user_connections do MySQL
globalForPrisma.prisma = prisma

// Utilitário com retry automático para operações críticas
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt))
      }
    }
  }
  throw lastError
}
