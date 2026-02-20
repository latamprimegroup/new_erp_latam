import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminHash = await hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@adsativos.com' },
    update: {},
    create: {
      email: 'admin@adsativos.com',
      name: 'Admin',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })
  console.log('Admin criado:', admin.email)

  const producerHash = await hash('produtor123', 12)
  await prisma.user.upsert({
    where: { email: 'produtor@adsativos.com' },
    update: {},
    create: {
      email: 'produtor@adsativos.com',
      name: 'Produtor Teste',
      passwordHash: producerHash,
      role: 'PRODUCER',
    },
  })
  console.log('Produtor criado')

  const clientHash = await hash('cliente123', 12)
  const client = await prisma.user.upsert({
    where: { email: 'cliente@adsativos.com' },
    update: {},
    create: {
      email: 'cliente@adsativos.com',
      name: 'Cliente Teste',
      passwordHash: clientHash,
      role: 'CLIENT',
    },
  })
  await prisma.clientProfile.upsert({
    where: { userId: client.id },
    update: {},
    create: { userId: client.id, whatsapp: '5511999999999' },
  })
  console.log('Cliente criado:', client.email)

  const commercialHash = await hash('comercial123', 12)
  await prisma.user.upsert({
    where: { email: 'comercial@adsativos.com' },
    update: {},
    create: {
      email: 'comercial@adsativos.com',
      name: 'Comercial Teste',
      passwordHash: commercialHash,
      role: 'COMMERCIAL',
    },
  })
  console.log('Comercial criado')

  const delivererHash = await hash('entregador123', 12)
  await prisma.user.upsert({
    where: { email: 'entregador@adsativos.com' },
    update: {},
    create: {
      email: 'entregador@adsativos.com',
      name: 'Entregador Teste',
      passwordHash: delivererHash,
      role: 'DELIVERER',
    },
  })
  console.log('Entregador criado')

  const plugPlayHash = await hash('plugplay123', 12)
  await prisma.user.upsert({
    where: { email: 'plugplay@adsativos.com' },
    update: {},
    create: {
      email: 'plugplay@adsativos.com',
      name: 'Operador Plug & Play',
      passwordHash: plugPlayHash,
      role: 'PLUG_PLAY',
    },
  })
  console.log('Operador Plug & Play criado: plugplay@adsativos.com / plugplay123')

  await prisma.systemSetting.upsert({
    where: { key: 'meta_producao_mensal' },
    update: {},
    create: { key: 'meta_producao_mensal', value: '10000' },
  })
  await prisma.systemSetting.upsert({
    where: { key: 'meta_vendas_mensal' },
    update: {},
    create: { key: 'meta_vendas_mensal', value: '10000' },
  })
  const bonusLevels = [
    { key: 'bonus_nivel_1', value: '200' },
    { key: 'bonus_nivel_2', value: '250' },
    { key: 'bonus_nivel_3', value: '300' },
    { key: 'bonus_nivel_max', value: '330' },
  ]
  for (const b of bonusLevels) {
    await prisma.systemSetting.upsert({
      where: { key: b.key },
      update: {},
      create: { key: b.key, value: b.value },
    })
  }
  await prisma.systemSetting.upsert({
    where: { key: 'black_pagamento_por_conta_24h' },
    update: {},
    create: { key: 'black_pagamento_por_conta_24h', value: '50' },
  })
  console.log('Metas globais: 10.000 produção e vendas/mês | Níveis de bônus | Black: R$ 50/conta 24h')
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
