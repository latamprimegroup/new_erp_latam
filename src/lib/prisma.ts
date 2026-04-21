import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

// Reutiliza a instância em todos os ambientes (crítico no serverless/Vercel)
// Sem isso cada request cria um novo pool e esgota max_user_connections do MySQL
globalForPrisma.prisma = prisma
