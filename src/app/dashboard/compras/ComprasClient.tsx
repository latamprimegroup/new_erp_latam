'use client'

import { useState } from 'react'
import { ShoppingCart, Store, Package, Zap, Upload, AlertTriangle, Search, ClipboardList, BarChart2, ShieldAlert, Truck, Crosshair } from 'lucide-react'
import { FornecedoresTab } from './FornecedoresTab'
import { EstoqueTab } from './EstoqueTab'
import { CopyGeneratorTab } from './CopyGeneratorTab'
import { BulkImportTab } from './BulkImportTab'
import { PedidosTab } from './PedidosTab'
import { ConsultaPrecoTab } from './ConsultaPrecoTab'
import { OrdensComerciais } from './OrdensComerciais'
import { AssetBiTab } from './AssetBiTab'
import { AssetIntakeTab } from './AssetIntakeTab'
import { RMATab } from './RMATab'
import { WarRoomCeoTab } from './WarRoomCeoTab'
import EntradaMercadoriaClient from '../admin/entrada-mercadoria/EntradaMercadoriaClient'

type Tab = 'war-room' | 'estoque' | 'fornecedores' | 'copy' | 'bulk' | 'pedidos' | 'consulta' | 'orders' | 'bi' | 'intake' | 'rma' | 'entrada-merc'

const TABS: { id: Tab; label: string; icon: React.ReactNode; roles: string[] }[] = [
  { id: 'war-room',     label: '🛰️ War Room OS',           icon: <Crosshair className="w-4 h-4" />,      roles: ['ADMIN'] },
  { id: 'entrada-merc', label: '🚚 Entrada de Mercadoria', icon: <Truck className="w-4 h-4" />,          roles: ['ADMIN','PURCHASING'] },
  { id: 'intake',       label: '📥 Intake de Ativos',      icon: <ClipboardList className="w-4 h-4" />,  roles: ['ADMIN','PURCHASING'] },
  { id: 'consulta',     label: 'Consulta de Preço',        icon: <Search className="w-4 h-4" />,         roles: ['ADMIN','PURCHASING','COMMERCIAL','DELIVERER'] },
  { id: 'orders',       label: 'Ordens de Serviço',        icon: <ShoppingCart className="w-4 h-4" />,   roles: ['ADMIN','PURCHASING','COMMERCIAL','FINANCE','DELIVERER'] },
  { id: 'rma',          label: 'Trocas & Garantia',        icon: <ShieldAlert className="w-4 h-4" />,    roles: ['ADMIN','PURCHASING','COMMERCIAL','FINANCE'] },
  { id: 'estoque',      label: 'Estoque de Ativos',        icon: <Package className="w-4 h-4" />,        roles: ['ADMIN','PURCHASING','COMMERCIAL','FINANCE'] },
  { id: 'fornecedores', label: 'Fornecedores',             icon: <Store className="w-4 h-4" />,          roles: ['ADMIN','PURCHASING'] },
  { id: 'pedidos',      label: 'Ordens de Compra',         icon: <Upload className="w-4 h-4" />,         roles: ['ADMIN','PURCHASING','FINANCE'] },
  { id: 'bi',           label: 'BI & Margem',              icon: <BarChart2 className="w-4 h-4" />,      roles: ['ADMIN','PURCHASING','FINANCE'] },
  { id: 'bulk',         label: 'Importação CSV',           icon: <Upload className="w-4 h-4" />,         roles: ['ADMIN','PURCHASING'] },
  { id: 'copy',         label: 'Copy Generator',           icon: <Zap className="w-4 h-4" />,            roles: ['ADMIN','PURCHASING','COMMERCIAL'] },
]

export function ComprasClient({ role }: { role: string }) {
  const defaultTab: Tab = role === 'ADMIN' ? 'war-room' : (role === 'PURCHASING') ? 'entrada-merc' : ['COMMERCIAL','DELIVERER'].includes(role) ? 'consulta' : 'estoque'
  const [tab, setTab] = useState<Tab>(defaultTab)

  const visibleTabs = TABS.filter((t) => t.roles.includes(role))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supply Chain & White Label</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Motor de vendas, arbitragem de ativos e inteligência de margem
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span><strong>Segregação Total:</strong> Entrega vê credenciais · Comercial vê ID/preço · Compras vê fornecedor · Admin vê tudo</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {tab === 'war-room'     && <WarRoomCeoTab />}
        {tab === 'entrada-merc' && <EntradaMercadoriaClient />}
        {tab === 'intake'       && <AssetIntakeTab />}
        {tab === 'consulta'     && <ConsultaPrecoTab role={role} />}
        {tab === 'orders'       && <OrdensComerciais role={role} />}
        {tab === 'rma'          && <RMATab userRole={role} />}
        {tab === 'estoque'      && <EstoqueTab role={role} />}
        {tab === 'fornecedores' && <FornecedoresTab />}
        {tab === 'pedidos'      && <PedidosTab role={role} />}
        {tab === 'bi'           && <AssetBiTab />}
        {tab === 'bulk'         && <BulkImportTab />}
        {tab === 'copy'         && <CopyGeneratorTab />}
      </div>
    </div>
  )
}
