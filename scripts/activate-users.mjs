import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Ativa todos os usuários existentes que não sejam CLIENT
// (garante que ninguém da equipe atual fique bloqueado)
const staff = await p.user.updateMany({
  where: { role: { not: 'CLIENT' } },
  data:  { status: 'ACTIVE' },
})
console.log(`Staff ativados: ${staff.count}`)

// CLIENT que já existia também fica ACTIVE
const clients = await p.user.updateMany({
  where: { role: 'CLIENT' },
  data:  { status: 'ACTIVE' },
})
console.log(`Clientes ativados: ${clients.count}`)

await p.$disconnect()
