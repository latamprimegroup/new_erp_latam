import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

// Prefixo para dados de seed - evita conflito com dados reais
const SEED_PREFIX = 'seed-'

async function main() {
  console.log('🌱 Iniciando seed completo...\n')

  // ============ 1. TENANT ============
  await prisma.tenant.upsert({
    where: { slug: 'ads-ativos' },
    update: {},
    create: { name: 'Ads Ativos', slug: 'ads-ativos', active: true },
  })
  console.log('✓ Tenant ads-ativos')

  // ============ 2. USUÁRIOS ============
  const pwdHash = await hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@adsativos.com' },
    update: {},
    create: {
      email: 'admin@adsativos.com',
      name: 'Admin Sistema',
      passwordHash: pwdHash,
      role: 'ADMIN',
    },
  })
  console.log('✓ Admin:', admin.email)

  const producerHash = await hash('produtor123', 12)
  const producer = await prisma.user.upsert({
    where: { email: 'produtor@adsativos.com' },
    update: {},
    create: {
      email: 'produtor@adsativos.com',
      name: 'Produtor Teste',
      passwordHash: producerHash,
      role: 'PRODUCER',
    },
  })
  await prisma.producerProfile.upsert({
    where: { userId: producer.id },
    update: {},
    create: { userId: producer.id },
  })
  console.log('✓ Produtor:', producer.email)

  const clientHash = await hash('cliente123', 12)
  const clientUser = await prisma.user.upsert({
    where: { email: 'cliente@adsativos.com' },
    update: {},
    create: {
      email: 'cliente@adsativos.com',
      name: 'Cliente Teste',
      passwordHash: clientHash,
      role: 'CLIENT',
    },
  })
  const clientProfile = await prisma.clientProfile.upsert({
    where: { userId: clientUser.id },
    update: {
      clientCode: 'C001',
      whatsapp: '5511999999999',
      totalSpent: 15000,
      totalAccountsBought: 5,
      reputationScore: 85,
      averageAccountLifetimeDays: 45,
      nicheTag: 'WHITE',
    },
    create: {
      userId: clientUser.id,
      clientCode: 'C001',
      whatsapp: '5511999999999',
      totalSpent: 15000,
      totalAccountsBought: 5,
      reputationScore: 85,
      averageAccountLifetimeDays: 45,
      nicheTag: 'WHITE',
    },
  })
  console.log('✓ Cliente:', clientUser.email)

  const commercialHash = await hash('comercial123', 12)
  const commercial = await prisma.user.upsert({
    where: { email: 'comercial@adsativos.com' },
    update: {},
    create: {
      email: 'comercial@adsativos.com',
      name: 'Comercial Teste',
      passwordHash: commercialHash,
      role: 'COMMERCIAL',
    },
  })
  console.log('✓ Comercial:', commercial.email)

  const delivererHash = await hash('entregador123', 12)
  const deliverer = await prisma.user.upsert({
    where: { email: 'entregador@adsativos.com' },
    update: {},
    create: {
      email: 'entregador@adsativos.com',
      name: 'Entregador Teste',
      passwordHash: delivererHash,
      role: 'DELIVERER',
    },
  })
  await prisma.delivererProfile.upsert({
    where: { userId: deliverer.id },
    update: {},
    create: { userId: deliverer.id },
  })
  console.log('✓ Entregador:', deliverer.email)

  const financeHash = await hash('financeiro123', 12)
  const finance = await prisma.user.upsert({
    where: { email: 'financeiro@adsativos.com' },
    update: {},
    create: {
      email: 'financeiro@adsativos.com',
      name: 'Financeiro Teste',
      passwordHash: financeHash,
      role: 'FINANCE',
    },
  })
  console.log('✓ Financeiro:', finance.email)

  const managerHash = await hash('gestor123', 12)
  const manager = await prisma.user.upsert({
    where: { email: 'gestor@adsativos.com' },
    update: {},
    create: {
      email: 'gestor@adsativos.com',
      name: 'Gestor Contas',
      passwordHash: managerHash,
      role: 'MANAGER',
    },
  })
  await prisma.managerProfile.upsert({
    where: { userId: manager.id },
    update: {},
    create: { userId: manager.id },
  })
  console.log('✓ Gestor:', manager.email)

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
  console.log('✓ Plug & Play')

  // Cliente adicional
  const client2Hash = await hash('cliente2123', 12)
  const client2User = await prisma.user.upsert({
    where: { email: 'cliente2@adsativos.com' },
    update: {},
    create: {
      email: 'cliente2@adsativos.com',
      name: 'Cliente Premium',
      passwordHash: client2Hash,
      role: 'CLIENT',
    },
  })
  const client2Profile = await prisma.clientProfile.upsert({
    where: { userId: client2User.id },
    update: {
      clientCode: 'C002',
      whatsapp: '5521988887777',
      totalSpent: 45000,
      totalAccountsBought: 15,
      reputationScore: 92,
      nicheTag: 'BLACK',
    },
    create: {
      userId: client2User.id,
      clientCode: 'C002',
      whatsapp: '5521988887777',
      totalSpent: 45000,
      totalAccountsBought: 15,
      reputationScore: 92,
      nicheTag: 'BLACK',
    },
  })
  console.log('✓ Cliente 2:', client2User.email)

  // ============ 3. PAÍSES E NICHOS ============
  const br = await prisma.country.upsert({
    where: { code: 'BR' },
    update: {},
    create: { code: 'BR', name: 'Brasil', currency: 'BRL', currencySymbol: 'R$', active: true },
  })
  const us = await prisma.country.upsert({
    where: { code: 'US' },
    update: {},
    create: { code: 'US', name: 'Estados Unidos', currency: 'USD', currencySymbol: '$', active: true },
  })
  const mx = await prisma.country.upsert({
    where: { code: 'MX' },
    update: {},
    create: { code: 'MX', name: 'México', currency: 'MXN', currencySymbol: '$', active: true },
  })
  console.log('✓ Países: BR, US, MX')

  const nicheNutra = await prisma.niche.upsert({
    where: { id: `${SEED_PREFIX}niche-nutra` },
    update: {},
    create: {
      id: `${SEED_PREFIX}niche-nutra`,
      countryId: br.id,
      name: 'Nutra',
      cnaePattern: '47',
      active: true,
    },
  })
  const nicheEcom = await prisma.niche.upsert({
    where: { id: `${SEED_PREFIX}niche-ecom` },
    update: {},
    create: {
      id: `${SEED_PREFIX}niche-ecom`,
      countryId: br.id,
      name: 'E-commerce',
      active: true,
    },
  })
  console.log('✓ Nichos: Nutra, E-commerce')

  // ============ 4. FORNECEDORES ============
  const supplier = await prisma.supplier.upsert({
    where: { id: `${SEED_PREFIX}supplier-1` },
    update: {},
    create: {
      id: `${SEED_PREFIX}supplier-1`,
      name: 'Fornecedor Base BR',
      contact: 'contato@fornecedor.com',
      notes: 'Seed demo',
    },
  })
  console.log('✓ Fornecedor')

  // ============ 5. BASE DE EMAILS ============
  const batch = await prisma.emailBatch.upsert({
    where: { id: `${SEED_PREFIX}batch-1` },
    update: {},
    create: {
      id: `${SEED_PREFIX}batch-1`,
      supplierId: supplier.id,
      uploadedById: admin.id,
      filename: 'emails_seed.csv',
      totalImported: 50,
      failedCount: 0,
      duplicateCount: 0,
    },
  })

  const emails: string[] = []
  for (let i = 1; i <= 30; i++) {
    emails.push(`${SEED_PREFIX}email${i}@teste${i}.com`)
  }
  for (const emailAddr of emails) {
    await prisma.email.upsert({
      where: { email: emailAddr },
      update: {},
      create: {
        email: emailAddr,
        status: 'AVAILABLE',
        countryId: br.id,
        supplierId: supplier.id,
        batchId: batch.id,
      },
    })
  }
  console.log('✓ Emails base:', emails.length)

  // ============ 6. CNPJs ============
  const cnpjsData = [
    { cnpj: '11111111000101', razao: 'Empresa Nutra 1', nicheId: nicheNutra.id },
    { cnpj: '11111111000102', razao: 'Empresa Nutra 2', nicheId: nicheNutra.id },
    { cnpj: '11111111000103', razao: 'Empresa Nutra 3', nicheId: nicheNutra.id },
    { cnpj: '22222222000101', razao: 'Ecommerce Store 1', nicheId: nicheEcom.id },
    { cnpj: '22222222000102', razao: 'Ecommerce Store 2', nicheId: nicheEcom.id },
  ]
  const cnpjIds: string[] = []
  for (const c of cnpjsData) {
    const created = await prisma.cnpj.upsert({
      where: { cnpj: c.cnpj },
      update: {},
      create: {
        cnpj: c.cnpj,
        razaoSocial: c.razao,
        status: 'AVAILABLE',
        countryId: br.id,
        nicheId: c.nicheId,
      },
    })
    cnpjIds.push(created.id)
  }
  console.log('✓ CNPJs:', cnpjsData.length)

  // ============ 7. PERFIS DE PAGAMENTO ============
  for (let i = 0; i < 3; i++) {
    await prisma.paymentProfile.upsert({
      where: { id: `${SEED_PREFIX}pay${i}` },
      update: {},
      create: {
        id: `${SEED_PREFIX}pay${i}`,
        type: 'CARTÃO',
        gateway: 'Stripe',
        status: 'AVAILABLE',
        countryId: br.id,
        cnpjId: cnpjIds[i % cnpjIds.length],
      },
    })
  }
  console.log('✓ Perfis de pagamento: 3')

  // ============ 8. CONTAS DE ESTOQUE ============
  const stockAccounts: { id: string; clientId?: string }[] = []
  for (let i = 1; i <= 10; i++) {
    const isDelivered = i <= 4
    const acc = await prisma.stockAccount.upsert({
      where: { id: `${SEED_PREFIX}stock-${i}` },
      update: {},
      create: {
        id: `${SEED_PREFIX}stock-${i}`,
        platform: 'GOOGLE_ADS',
        type: 'BRL',
        source: 'PRODUCTION_G2',
        countryId: br.id,
        niche: 'Nutra',
        status: isDelivered ? 'DELIVERED' : 'AVAILABLE',
        clientId: isDelivered ? (i <= 2 ? clientProfile.id : client2Profile.id) : undefined,
        purchasePrice: 800,
        salePrice: 1200,
        markupPercent: 50,
        yearStarted: 2024,
        deliveredAt: isDelivered ? new Date() : undefined,
      },
    })
    stockAccounts.push({ id: acc.id, clientId: acc.clientId ?? undefined })
  }
  console.log('✓ Contas estoque: 10 (4 entregues, 6 disponíveis)')

  // ============ 9. PEDIDOS ============
  const order1 = await prisma.order.upsert({
    where: { id: `${SEED_PREFIX}order-1` },
    update: {},
    create: {
      id: `${SEED_PREFIX}order-1`,
      clientId: clientProfile.id,
      country: 'BR',
      product: 'Conta Google Ads BRL',
      accountType: 'BRL',
      quantity: 2,
      value: 2400,
      currency: 'BRL',
      status: 'DELIVERED',
      sellerId: commercial.id,
      paidAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  })

  const order2 = await prisma.order.upsert({
    where: { id: `${SEED_PREFIX}order-2` },
    update: {},
    create: {
      id: `${SEED_PREFIX}order-2`,
      clientId: client2Profile.id,
      country: 'BR',
      product: 'Conta Google Ads BRL',
      accountType: 'BRL',
      quantity: 3,
      value: 3600,
      currency: 'BRL',
      status: 'PAID',
      sellerId: commercial.id,
      paidAt: new Date(),
    },
  })
  console.log('✓ Pedidos: 2')

  // OrderItems - vincular contas entregues ao pedido 1
  const deliveredStock = stockAccounts.filter((s) => s.clientId === clientProfile.id).slice(0, 2)
  if (deliveredStock.length >= 2) {
    for (let i = 0; i < 2; i++) {
      await prisma.orderItem.upsert({
        where: { id: `${SEED_PREFIX}oi-${i}` },
        update: {},
        create: {
          id: `${SEED_PREFIX}oi-${i}`,
          orderId: order1.id,
          accountId: deliveredStock[i].id,
          quantity: 1,
        },
      })
    }
  }
  console.log('✓ OrderItems')

  // ============ 10. DELIVERY (entrega legada) ============
  await prisma.delivery.upsert({
    where: { orderId: order1.id },
    update: {},
    create: {
      orderId: order1.id,
      qtySold: 2,
      qtyDelivered: 2,
      status: 'DELIVERED',
      responsibleId: deliverer.id,
      deliveredAt: new Date(),
    },
  })
  console.log('✓ Delivery')

  // ============ 11. DELIVERY GROUPS ============
  const dg1 = await prisma.deliveryGroup.upsert({
    where: { groupNumber: 'GR-0001' },
    update: {},
    create: {
      groupNumber: 'GR-0001',
      clientId: clientProfile.id,
      orderId: order1.id,
      whatsappGroupLink: 'https://chat.whatsapp.com/seed-demo-gr001',
      accountType: 'BRL',
      quantityContracted: 2,
      quantityDelivered: 2,
      currency: 'BRL',
      paymentType: 'MANUAL',
      estimatedTimeHours: 48,
      status: 'FINALIZADA',
      responsibleId: deliverer.id,
      saleDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  })

  const dg2 = await prisma.deliveryGroup.upsert({
    where: { groupNumber: 'GR-0002' },
    update: {},
    create: {
      groupNumber: 'GR-0002',
      clientId: client2Profile.id,
      orderId: order2.id,
      whatsappGroupLink: 'https://chat.whatsapp.com/seed-demo-gr002',
      accountType: 'BRL',
      quantityContracted: 3,
      quantityDelivered: 0,
      currency: 'BRL',
      paymentType: 'AUTOMATICO',
      estimatedTimeHours: 72,
      status: 'EM_ANDAMENTO',
      responsibleId: deliverer.id,
      saleDate: new Date(),
    },
  })
  console.log('✓ Delivery Groups: 2')

  // ============ 12. PRODUCTION G2 ============
  const g2Statuses = ['PARA_CRIACAO', 'CRIANDO_GMAIL', 'EM_REVISAO', 'APROVADA'] as const
  for (let i = 1; i <= 6; i++) {
    await prisma.productionG2.upsert({
      where: { codeG2: `G2-SEED-${String(i).padStart(4, '0')}` },
      update: {},
      create: {
        taskName: `Conta Seed ${i}`,
        currency: 'BRL',
        creatorId: producer.id,
        status: g2Statuses[(i - 1) % g2Statuses.length],
        codeG2: `G2-SEED-${String(i).padStart(4, '0')}`,
        itemId: `ITEM-SEED-${String(i).padStart(4, '0')}`,
        clientId: i <= 2 ? clientProfile.id : i <= 4 ? client2Profile.id : undefined,
        deliveryGroupId: i <= 2 ? dg1.id : i <= 4 ? dg2.id : undefined,
      },
    })
  }
  console.log('✓ Production G2: 6 itens')

  // ============ 13. FINANCEIRO ============
  const catReceita = await prisma.financialCategory.upsert({
    where: { id: `${SEED_PREFIX}cat-receita` },
    update: {},
    create: {
      id: `${SEED_PREFIX}cat-receita`,
      name: 'Receita Vendas',
      type: 'INCOME',
      active: true,
    },
  })
  const catCusto = await prisma.financialCategory.upsert({
    where: { id: `${SEED_PREFIX}cat-custo` },
    update: {},
    create: {
      id: `${SEED_PREFIX}cat-custo`,
      name: 'Custo Produção',
      type: 'EXPENSE',
      active: true,
    },
  })

  await prisma.financialEntry.create({
    data: {
      type: 'INCOME',
      category: 'Vendas',
      categoryId: catReceita.id,
      value: 2400,
      currency: 'BRL',
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      orderId: order1.id,
      deliveryGroupId: dg1.id,
      netProfit: 800,
      description: 'Pedido #1 - 2 contas BRL',
    },
  })
  await prisma.financialEntry.create({
    data: {
      type: 'EXPENSE',
      category: 'Produção',
      categoryId: catCusto.id,
      value: 600,
      currency: 'BRL',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      description: 'Custo operacional produção',
    },
  })
  console.log('✓ Lançamentos financeiros: 2')

  // ============ 14. METAS ============
  await prisma.goal.upsert({
    where: { id: `${SEED_PREFIX}goal-prod` },
    update: {},
    create: {
      id: `${SEED_PREFIX}goal-prod`,
      userId: producer.id,
      dailyTarget: 5,
      monthlyTarget: 100,
      productionCurrent: 42,
      bonus: 250,
      status: 'active',
      periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    },
  })
  console.log('✓ Meta produtor')

  // ============ 15. SAQUES ============
  await prisma.withdrawal.create({
    data: {
      userId: producer.id,
      gateway: 'PIX',
      value: 1500,
      fee: 0,
      netValue: 1500,
      status: 'COMPLETED',
    },
  })
  await prisma.withdrawal.create({
    data: {
      userId: producer.id,
      gateway: 'PIX',
      value: 800,
      fee: 0,
      netValue: 800,
      status: 'PENDING',
    },
  })
  console.log('✓ Saques: 2')

  // ============ 16. NOTIFICAÇÕES ============
  for (const u of [admin, producer, clientUser]) {
    await prisma.notification.create({
      data: {
        userId: u.id,
        type: 'TASK_ALERT',
        title: 'Seed Demo',
        message: `Notificação de teste para ${u.name}`,
        read: false,
        priority: 'NORMAL',
      },
    })
  }
  console.log('✓ Notificações: 3')

  // ============ 17. TICKETS ============
  const accountForTicket = stockAccounts.find((s) => s.clientId)?.id ?? stockAccounts[0].id
  await prisma.contestationTicket.upsert({
    where: { id: `${SEED_PREFIX}ct-1` },
    update: {},
    create: {
      id: `${SEED_PREFIX}ct-1`,
      clientId: clientProfile.id,
      accountId: accountForTicket,
      type: 'BAN_CONTESTATION',
      status: 'OPEN',
      description: 'Conta banida - solicito contestação. Seed demo.',
    },
  })

  await prisma.supportTicket.upsert({
    where: { ticketNumber: 'TKT-SEED-001' },
    update: {},
    create: {
      ticketNumber: 'TKT-SEED-001',
      clientId: clientProfile.id,
      subject: 'Dúvida sobre entrega',
      description: 'Quando recebo minhas contas? Seed demo.',
      category: 'DUVIDA',
      status: 'OPEN',
    },
  })
  console.log('✓ Tickets: contestação + suporte')

  // ============ 18. ORDEM DE SERVIÇO ============
  await prisma.serviceOrder.upsert({
    where: { orderNumber: 'OS-SEED-001' },
    update: {},
    create: {
      clientId: clientProfile.id,
      type: 'CONFIGURACAO',
      title: 'Configuração inicial conta',
      description: 'Ajuda na primeira campanha. Seed demo.',
      status: 'ABERTA',
      orderNumber: 'OS-SEED-001',
    },
  })
  console.log('✓ Ordem de serviço')

  // ============ 19. SOLICITAÇÃO DE CONTAS ============
  await prisma.accountSolicitation.create({
    data: {
      clientId: clientProfile.id,
      quantity: 5,
      product: 'Conta Google Ads',
      accountType: 'BRL',
      country: 'BR',
      status: 'pending',
      notes: 'Seed demo - próxima compra',
    },
  })
  console.log('✓ Solicitação de contas')

  // ============ 20. ONBOARDING MEETING ============
  await prisma.onboardingMeeting.create({
    data: {
      clientId: client2Profile.id,
      title: 'Onboarding Cliente Premium',
      notes: 'Reunião inicial. Seed demo.',
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      durationMinutes: 45,
      status: 'SCHEDULED',
      createdById: admin.id,
    },
  })
  console.log('✓ Reunião onboarding')

  // ============ 21. CUSTOMER METRICS ============
  await prisma.customerMetrics.upsert({
    where: { clientId: clientProfile.id },
    update: {
      referenceDate: new Date(),
      revenueTotal: 15000,
      costTotal: 6000,
      marginTotal: 9000,
      ticketMedio: 3000,
      mesesRelacionamento: 6,
      ltvBruto: 15000,
      ltvLiquido: 9000,
      segmento: 'PREMIUM',
    },
    create: {
      clientId: clientProfile.id,
      referenceDate: new Date(),
      revenueTotal: 15000,
      costTotal: 6000,
      marginTotal: 9000,
      ticketMedio: 3000,
      mesesRelacionamento: 6,
      ltvBruto: 15000,
      ltvLiquido: 9000,
      segmento: 'PREMIUM',
    },
  })
  console.log('✓ Customer Metrics')

  // ============ 22. CONFIGURAÇÕES GLOBAIS ============
  const settings = [
    { key: 'meta_producao_mensal', value: '10000' },
    { key: 'meta_vendas_mensal', value: '10000' },
    { key: 'bonus_nivel_1', value: '200' },
    { key: 'bonus_nivel_2', value: '250' },
    { key: 'bonus_nivel_3', value: '300' },
    { key: 'bonus_nivel_max', value: '330' },
    { key: 'black_pagamento_por_conta_24h', value: '50' },
  ]
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    })
  }
  console.log('✓ Configurações globais')

  // ============ 23. SUGESTÕES ============
  await prisma.suggestion.create({
    data: {
      category: 'SYSTEM',
      title: 'Melhoria sugerida no seed',
      description: 'Exemplo de sugestão de melhoria do sistema. Seed demo.',
      userId: producer.id,
    },
  })
  console.log('✓ Sugestão')

  console.log('\n✅ Seed completo finalizado com sucesso!')
  console.log('\nLogins disponíveis (senha em cada):')
  console.log('  admin@adsativos.com / admin123')
  console.log('  produtor@adsativos.com / produtor123')
  console.log('  cliente@adsativos.com / cliente123')
  console.log('  cliente2@adsativos.com / cliente2123')
  console.log('  comercial@adsativos.com / comercial123')
  console.log('  entregador@adsativos.com / entregador123')
  console.log('  financeiro@adsativos.com / financeiro123')
  console.log('  gestor@adsativos.com / gestor123')
  console.log('  plugplay@adsativos.com / plugplay123')
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Erro no seed:', e)
    prisma.$disconnect()
    process.exit(1)
  })
