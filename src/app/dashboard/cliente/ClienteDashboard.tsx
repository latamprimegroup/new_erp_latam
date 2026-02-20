'use client'

import Link from 'next/link'

type Kpis = {
  comprasTotal: number
  comprasAprovadas: number
  comprasPendentes: number
  contasDisponiveis: number
}

export function ClienteDashboard({ kpis }: { kpis: Kpis }) {
  return (
    <div>
      <h1 className="heading-1 mb-6">
        Área do Cliente
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">Contas Compradas</p>
          <p className="text-2xl font-bold text-primary-600">{kpis.comprasTotal}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Compras Aprovadas</p>
          <p className="text-2xl font-bold text-green-600">{kpis.comprasAprovadas}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Compras em Análise</p>
          <p className="text-2xl font-bold text-amber-600">{kpis.comprasPendentes}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Contas Disponíveis</p>
          <p className="text-2xl font-bold text-primary-600">{kpis.contasDisponiveis}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/dashboard/cliente/solicitar"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all border-primary-600/10"
        >
          <h3 className="font-semibold text-lg mb-2">Solicitar Novas Contas</h3>
          <p className="text-gray-500 text-sm">
            Repita sua última compra ou informe a quantidade desejada.
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/pesquisar"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Pesquisar Contas Disponíveis</h3>
          <p className="text-gray-500 text-sm">
            Encontre contas por tipo, plataforma, ano e consumo mínimo.
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/compras"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Minhas Compras</h3>
          <p className="text-gray-500 text-sm">
            Histórico de transações e status das suas compras.
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/contas"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Minhas Contas e Gastos</h3>
          <p className="text-gray-500 text-sm">
            Gastos por conta, ROI, taxa de aproveitamento e sincronização via Google Ads API.
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/contestacoes"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Contestações</h3>
          <p className="text-gray-500 text-sm">
            Contestar contas banidas, solicitar reposição ou operação comercial.
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/perfil"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Editar Dados Pessoais</h3>
          <p className="text-gray-500 text-sm">
            Atualize e-mail, senha, WhatsApp e notificações.
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/suporte"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">Suporte</h3>
          <p className="text-gray-500 text-sm">
            FAQ, formulário de contato e suporte por e-mail.
          </p>
        </Link>
      </div>
    </div>
  )
}
