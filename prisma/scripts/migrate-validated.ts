/**
 * Script de migração: marca contas aprovadas existentes como validadas.
 * Use após deploy do Gerente de Produção para contas históricas.
 *
 * Executar: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/scripts/migrate-validated.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
  })
  if (!admin) {
    console.error('Nenhum usuário ADMIN encontrado.')
    process.exit(1)
  }

  const [acc, g2] = await Promise.all([
    prisma.productionAccount.updateMany({
      where: {
        status: 'APPROVED',
        validatedAt: null,
      },
      data: {
        validatedByManagerId: admin.id,
        validatedAt: new Date(), // usa updatedAt via raw se preferir
      },
    }),
    prisma.productionG2.updateMany({
      where: {
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        archivedAt: null,
        validatedAt: null,
      },
      data: {
        validatedByManagerId: admin.id,
        validatedAt: new Date(),
      },
    }),
  ])

  console.log(`Migração concluída: ${acc.count} ProductionAccount, ${g2.count} ProductionG2.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
