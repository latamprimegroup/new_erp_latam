'use client'

type Kpis = {
  productionDaily: number
  productionMonthly: number
  stockCount: number
  ordersPending: number
}

export function DashboardCards({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-8 animate-slide-up">
      <div className="card group hover:shadow-ads-md transition-all duration-300">
        <h3 className="font-medium text-[#1F2937]/70 text-sm">Produção Diária</h3>
        <p className="text-3xl font-bold text-primary-600 mt-1">{kpis.productionDaily}</p>
      </div>
      <div className="card group hover:shadow-ads-md transition-all duration-300">
        <h3 className="font-medium text-[#1F2937]/70 text-sm">Produção Mensal</h3>
        <p className="text-3xl font-bold text-primary-600 mt-1">{kpis.productionMonthly}</p>
      </div>
      <div className="card group hover:shadow-ads-md transition-all duration-300">
        <h3 className="font-medium text-[#1F2937]/70 text-sm">Estoque Disponível</h3>
        <p className="text-3xl font-bold text-primary-600 mt-1">{kpis.stockCount}</p>
      </div>
      <div className="card group hover:shadow-ads-md transition-all duration-300">
        <h3 className="font-medium text-[#1F2937]/70 text-sm">Vendas Pendentes</h3>
        <p className="text-3xl font-bold text-primary-600 mt-1">{kpis.ordersPending}</p>
      </div>
    </div>
  )
}
