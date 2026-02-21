import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function GestorDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const manager = await prisma.managerProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!manager) redirect('/dashboard')

  const [total, emAnalise, aprovadas, rejeitadas] = await Promise.all([
    prisma.stockAccount.count({ where: { managerId: manager.id } }),
    prisma.stockAccount.count({ where: { managerId: manager.id, status: 'PENDING' } }),
    prisma.stockAccount.count({ where: { managerId: manager.id, status: 'APPROVED' } }),
    prisma.stockAccount.count({ where: { managerId: manager.id, status: 'REJECTED' } }),
  ])

  const orderItems = await prisma.orderItem.findMany({
    where: { account: { managerId: manager.id } },
    include: { order: { select: { value: true } } },
  })
  const receitaTotal = orderItems.reduce((acc, i) => acc + Number(i.order.value), 0)

  return (
    <div>
      <h1 className="heading-1 mb-6">
        Área do Gestor
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">Contas Cadastradas</p>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Em Análise</p>
          <p className="text-2xl font-bold text-amber-600">{emAnalise}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Aprovadas</p>
          <p className="text-2xl font-bold text-green-600">{aprovadas}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Rejeitadas</p>
          <p className="text-2xl font-bold text-red-600">{rejeitadas}</p>
        </div>
      </div>

      <div className="card mb-8">
        <h2 className="font-semibold mb-4">Vendas e Lucro</h2>
        <div className="flex gap-8">
          <div>
            <p className="text-sm text-gray-500">Vendas realizadas</p>
            <p className="text-2xl font-bold">{orderItems.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Receita total</p>
            <p className="text-2xl font-bold text-green-600">R$ {receitaTotal.toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/dashboard/gestor/lancar"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Lançar Nova Conta</h3>
          <p className="text-gray-500 text-sm">
            Cadastre novas contas para venda com tipo, ano, nicho e markup.
          </p>
        </Link>
        <Link
          href="/dashboard/gestor/contas"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Gerenciar Contas</h3>
          <p className="text-gray-500 text-sm">
            Visualize e edite suas contas cadastradas.
          </p>
        </Link>
        <Link
          href="/dashboard/gestor/relatorios"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Relatórios de Vendas</h3>
          <p className="text-gray-500 text-sm">
            Acompanhe seu desempenho e lucros por período.
          </p>
        </Link>
      </div>
    </div>
  )
}
