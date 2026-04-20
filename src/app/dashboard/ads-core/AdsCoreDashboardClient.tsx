'use client'

import Link from 'next/link'
import { AdsCoreGerenteClient } from './AdsCoreGerenteClient'
import { AdsCoreGerenteInventoryBar } from './AdsCoreGerenteInventoryBar'
import { AdsCoreProdutorClient } from './AdsCoreProdutorClient'

export function AdsCoreDashboardClient({ role }: { role?: string }) {
  const isGerente = role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
  const isProducer = role === 'PRODUCER'

  return (
    <div>
      <h1 className="heading-1 mb-1">ADS CORE</h1>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-2">
        Cérebro operacional — inteligência, segregação e atribuição
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
        Motor de distribuição de ativos em escala (1.000+ produtores): identidade única por conta, células de nicho
        (Google G2, Meta Business, TikTok), ingestão em massa e anti-idle. O produtor vê só o próprio balde; CNPJ e
        domínio são vigiados contra pegada digital; cópias e documentos ficam auditados. Acesso via login único (
        <strong className="font-medium text-gray-700 dark:text-gray-300">NextAuth</strong>
        ): perfis <code className="text-xs">ADMIN</code> / <code className="text-xs">PRODUCTION_MANAGER</code>{' '}
        (fábrica) e <code className="text-xs">PRODUCER</code> (esteira isolada).
      </p>

      {isGerente && (
        <div className="text-sm mb-6 flex flex-wrap gap-x-6 gap-y-2">
          <Link
            href="/dashboard/ads-core/nichos"
            className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            Gestão por nicho (colaboradores × célula)
          </Link>
          <Link
            href="/dashboard/ads-core/atribuicao"
            className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            Estoque de ativos — atribuição e documentos
          </Link>
          <Link
            href="/dashboard/ads-core/demandas"
            className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            Painel de demandas (visão gerente)
          </Link>
          <Link
            href="/dashboard/ads-core/gestao-contas"
            className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            Gestão de contas (MCC) — painel de guerra
          </Link>
          <Link
            href="/dashboard/ads-core/relatorios-producao"
            className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            Relatórios de produção e auditoria
          </Link>
          <Link
            href="/dashboard/ads-core/bi"
            className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            Dashboard de gestão (pipeline, ranking, reprovações)
          </Link>
          <Link
            href="/dashboard/ads-core/rg-abastecimento"
            className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            Abastecimento de RG (estoque)
          </Link>
        </div>
      )}

      {isGerente && <AdsCoreGerenteInventoryBar />}

      {isGerente && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-primary-600 mb-3">Visão gerente — cadastro e carimbo</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 max-w-3xl">
            Ativos já cadastrados podem ser{' '}
            <Link href="/dashboard/ads-core/atribuicao" className="text-primary-600 dark:text-primary-400 hover:underline">
              editados ou excluídos
            </Link>{' '}
            na tela de estoque e atribuição (com confirmação na exclusão).
          </p>
          <AdsCoreGerenteClient />
        </section>
      )}

      {isProducer && (
        <section>
          <h2 className="text-lg font-semibold text-primary-600 mb-3">
            Esteira de produção — visão do colaborador (dados + documentos)
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-3xl">
            Apenas ativos atribuídos a você. O nicho em destaque orienta congruência com o briefing; o site é editável
            com validação global de unicidade (nenhum outro colaborador pode reutilizar o mesmo domínio).
          </p>
          <AdsCoreProdutorClient />
        </section>
      )}

      {!isGerente && !isProducer && (
        <p className="text-red-600">Seu perfil não tem acesso a este módulo.</p>
      )}
    </div>
  )
}
