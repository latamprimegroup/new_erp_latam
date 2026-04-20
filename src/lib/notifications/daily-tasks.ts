/**
 * Coleta tarefas do dia por setor/role
 */
import { prisma } from '../prisma'

const BASE_URL =
  process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000'

export type DailyTasksData = {
  role: string
  name: string
  tasks: Record<string, number | string>
  message: string
  link: string
}

export async function getDailyTasksForUser(
  userId: string,
  role: string,
  userName?: string
): Promise<DailyTasksData> {
  const name = userName || 'Colaborador'

  switch (role) {
    case 'PRODUCER':
      return getProducerTasks(userId, name)
    case 'DELIVERER':
      return getDelivererTasks(userId, name)
    case 'FINANCE':
      return getFinanceTasks(name)
    case 'COMMERCIAL':
      return getCommercialTasks(name)
    case 'MANAGER':
      return getManagerTasks(userId, name)
    case 'PLUG_PLAY':
      return getPlugPlayTasks(userId, name)
    case 'ADMIN':
      return getAdminTasks(name)
    default:
      return {
        role,
        name,
        tasks: {},
        message: `Olá ${name}! Acesse o sistema para ver suas atividades.`,
        link: `${BASE_URL}/dashboard`,
      }
  }
}

async function getProducerTasks(userId: string, name: string): Promise<DailyTasksData> {
  const [pendingApproval, goal] = await Promise.all([
    prisma.productionAccount.count({
      where: { producerId: userId, status: 'PENDING' },
    }),
    prisma.goal.findFirst({
      where: { userId, status: 'active' },
      orderBy: { periodEnd: 'desc' },
    }),
  ])

  const dailyMeta = goal?.dailyTarget ?? 0
  const msg = [
    `Olá ${name}!`,
    `Hoje você tem: *${pendingApproval}* conta(s) pendentes de aprovação.`,
    dailyMeta > 0 ? `Meta do dia: *${dailyMeta}* conta(s).` : '',
    `Acesse: ${BASE_URL}/dashboard/producao`,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    role: 'PRODUCER',
    name,
    tasks: { pendingApproval, dailyMeta },
    message: msg,
    link: `${BASE_URL}/dashboard/producao`,
  }
}

async function getDelivererTasks(userId: string, name: string): Promise<DailyTasksData> {
  const [deliveries, groups, repositions] = await Promise.all([
    prisma.delivery.count({
      where: {
        responsibleId: userId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'DELAYED'] },
      },
    }),
    prisma.deliveryGroup.count({
      where: {
        responsibleId: userId,
        status: { in: ['AGUARDANDO_INICIO', 'EM_ANDAMENTO', 'PARCIALMENTE_ENTREGUE', 'ATRASADA', 'EM_REPOSICAO'] },
      },
    }),
    prisma.deliveryReposition.count({
      where: {
        delivery: { responsibleId: userId },
        status: { in: ['SOLICITADA', 'APROVADA'] },
      },
    }),
  ])

  const msg = [
    `Olá ${name}!`,
    `Você tem: *${deliveries}* entrega(s) pendente(s) e *${groups}* grupo(s) em andamento.`,
    repositions > 0 ? `*${repositions}* reposição(ões) solicitada(s).` : '',
    `Acesse: ${BASE_URL}/dashboard/entregas-grupos`,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    role: 'DELIVERER',
    name,
    tasks: { deliveries, groups, repositions },
    message: msg,
    link: `${BASE_URL}/dashboard/entregas-grupos`,
  }
}

async function getFinanceTasks(name: string): Promise<DailyTasksData> {
  const [withdrawals, pendingAccounts] = await Promise.all([
    prisma.withdrawal.count({ where: { status: 'PENDING' } }),
    prisma.productionAccount.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
  ])

  const msg = [
    `Olá ${name}!`,
    `Saques pendentes: *${withdrawals}*.`,
    `Contas para aprovar: *${pendingAccounts}*.`,
    `Acesse: ${BASE_URL}/dashboard/saques`,
  ].join(' ')

  return {
    role: 'FINANCE',
    name,
    tasks: { withdrawals, pendingAccounts },
    message: msg,
    link: `${BASE_URL}/dashboard/saques`,
  }
}

async function getCommercialTasks(name: string): Promise<DailyTasksData> {
  const [orders, contestations, solicitations] = await Promise.all([
    prisma.order.count({
      where: { status: { in: ['PENDING', 'PAID', 'IN_DELIVERY'] } },
    }),
    prisma.contestationTicket.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.accountSolicitation.count({ where: { status: 'pending' } }),
  ])

  const msg = [
    `Olá ${name}!`,
    `Pedidos pendentes: *${orders}*.`,
    `Contestações abertas: *${contestations}*.`,
    `Solicitações de contas: *${solicitations}*.`,
    `Acesse: ${BASE_URL}/dashboard/vendas`,
  ].join(' ')

  return {
    role: 'COMMERCIAL',
    name,
    tasks: { orders, contestations, solicitations },
    message: msg,
    link: `${BASE_URL}/dashboard/vendas`,
  }
}

async function getManagerTasks(userId: string, name: string): Promise<DailyTasksData> {
  const manager = await prisma.managerProfile.findUnique({
    where: { userId },
  })
  const count = manager
    ? await prisma.stockAccount.count({
        where: { managerId: manager.id, status: 'PENDING' },
      })
    : 0

  const msg = [
    `Olá ${name}!`,
    `Você tem *${count}* conta(s) em análise no estoque.`,
    `Acesse: ${BASE_URL}/dashboard/gestor`,
  ].join(' ')

  return {
    role: 'MANAGER',
    name,
    tasks: { pendingAccounts: count },
    message: msg,
    link: `${BASE_URL}/dashboard/gestor`,
  }
}

async function getPlugPlayTasks(userId: string, name: string): Promise<DailyTasksData> {
  const [operations, payments] = await Promise.all([
    prisma.blackOperation.count({
      where: {
        collaboratorId: userId,
        status: { notIn: ['DRAFT', 'BANNED'] },
      },
    }),
    prisma.blackPayment.count({
      where: { collaboratorId: userId, status: 'PENDING' },
    }),
  ])

  const msg = [
    `Olá ${name}!`,
    `Operações em progresso: *${operations}*.`,
    `Pagamentos pendentes: *${payments}*.`,
    `Acesse: ${BASE_URL}/dashboard/plugplay`,
  ].join(' ')

  return {
    role: 'PLUG_PLAY',
    name,
    tasks: { operations, payments },
    message: msg,
    link: `${BASE_URL}/dashboard/plugplay`,
  }
}

async function getAdminTasks(name: string): Promise<DailyTasksData> {
  const [
    pendingAccounts,
    contestations,
    withdrawals,
    lateDeliveries,
    stockCritical,
  ] = await Promise.all([
    prisma.productionAccount.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
    prisma.contestationTicket.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.withdrawal.count({ where: { status: 'PENDING' } }),
    prisma.deliveryGroup.count({ where: { status: 'ATRASADA' } }),
    prisma.stockAccount.count({ where: { status: 'CRITICAL' } }),
  ])

  const msg = [
    `Olá ${name}!`,
    `Resumo Admin: Contas pendentes *${pendingAccounts}*.`,
    `Contestações *${contestations}*.`,
    `Saques *${withdrawals}*.`,
    `Entregas atrasadas *${lateDeliveries}*.`,
    `Estoque crítico *${stockCritical}*.`,
    `Acesse: ${BASE_URL}/dashboard/admin`,
  ].join(' ')

  return {
    role: 'ADMIN',
    name,
    tasks: {
      pendingAccounts,
      contestations,
      withdrawals,
      lateDeliveries,
      stockCritical,
    },
    message: msg,
    link: `${BASE_URL}/dashboard/admin`,
  }
}
