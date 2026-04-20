'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DASHBOARD_PLATFORM_OPTIONS } from '@/lib/account-platform-query'
import { DashboardBento } from './DashboardBento'
import { MetasMensaisCard } from './MetasMensaisCard'

type Props = {
  userName: string
  isAdmin: boolean
  userRole: string
}

export function ExecutiveDashboard({ userName, isAdmin, userRole }: Props) {
  const [platform, setPlatform] = useState('ALL')

  return (
    <div>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-1">Dashboard Executivo</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Bem-vindo(a), <span className="font-medium text-gray-700 dark:text-gray-300">{userName}</span>
        {' · '}Visão operacional em tempo real
      </p>

      <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="shrink-0 font-medium">Plataforma:</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="input-field py-2 text-sm min-w-[200px] max-w-full"
          >
            {DASHBOARD_PLATFORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {platform !== 'ALL' && (
          <p className="text-xs text-amber-700 dark:text-amber-300 max-w-xl">
            {userRole === 'PRODUCER' ? (
              <>
                Filtro por plataforma aplica-se à sua produção, estoque e rejeições. Saldo e previsão de ganhos são
                seus (não dependem da plataforma neste painel).
              </>
            ) : (
              <>
                Receita, saldo e bônus continuam globais; produção, estoque, vendas e metas abaixo refletem só a
                plataforma selecionada.
              </>
            )}
          </p>
        )}
      </div>

      {(isAdmin || ['COMMERCIAL', 'FINANCE'].includes(userRole)) && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/dashboard/roi-crm"
            className="inline-flex items-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-800 hover:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30"
          >
            ROI & CRM (TinTim + vendas)
          </Link>
          <Link
            href="/dashboard/vendas"
            className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/15 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            Módulo Vendas
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/financeiro"
              className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/15 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              Financeiro
            </Link>
          )}
          {userRole === 'FINANCE' && (
            <>
              <Link
                href="/dashboard/financeiro"
                className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/15 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Financeiro
              </Link>
              <Link
                href="/dashboard/saques?pendentes=1"
                className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/15 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Saques
              </Link>
            </>
          )}
          {(userRole === 'COMMERCIAL' || userRole === 'FINANCE' || isAdmin) && (
            <Link
              href="/dashboard/relatorios"
              className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/15 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              Relatórios & KPIs
            </Link>
          )}
          {isAdmin && (
            <>
              <Link
                href="/dashboard/saques?pendentes=1"
                className="inline-flex items-center rounded-lg border border-primary-500/40 bg-primary-500/10 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-500/20 dark:text-primary-300"
              >
                Saques pendentes / retidos
              </Link>
              <Link
                href="/dashboard/metas"
                className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/15 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Ajustar metas globais
              </Link>
              <Link
                href="/dashboard/estoque"
                className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/15 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Estoque
              </Link>
            </>
          )}
        </div>
      )}

      <div className="mt-6 space-y-6">
        <DashboardBento platform={platform} isAdmin={isAdmin} userRole={userRole} />
        {isAdmin && <MetasMensaisCard isAdmin={isAdmin} platform={platform} />}
      </div>
    </div>
  )
}
