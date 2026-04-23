/**
 * Script: fix-pending-users.mjs
 *
 * Ativa todos os usuários existentes não-CLIENT que estão como PENDING.
 * Esses usuários foram criados antes do sistema de aprovação e precisam
 * ser ativados para não ficarem bloqueados indevidamente.
 *
 * Rodar: node scripts/fix-pending-users.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Lista usuários PENDING não-CLIENT
  const pending = await prisma.user.findMany({
    where:  { status: 'PENDING', role: { not: 'CLIENT' } },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  if (pending.length === 0) {
    console.log('✅ Nenhum usuário PENDING não-CLIENT encontrado. Tudo OK.')
    return
  }

  console.log(`\n⚠️  ${pending.length} usuário(s) PENDING encontrado(s):\n`)
  for (const u of pending) {
    console.log(`  - ${u.email} | ${u.role} | criado em ${u.createdAt.toLocaleDateString('pt-BR')}`)
  }

  // Ativa todos
  const result = await prisma.user.updateMany({
    where: { status: 'PENDING', role: { not: 'CLIENT' } },
    data:  { status: 'ACTIVE', approvedAt: new Date() },
  })

  console.log(`\n✅ ${result.count} usuário(s) ativado(s) com sucesso!\n`)
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
