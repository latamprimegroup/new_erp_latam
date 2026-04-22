'use client'

import Link from 'next/link'
import {
  BarChart3, LayoutList, Target, FolderOpen, FileBarChart2,
  Package, Database, Layers, ArrowRight, Zap,
} from 'lucide-react'
import { AdsCoreGerenteClient } from './AdsCoreGerenteClient'
import { AdsCoreGerenteInventoryBar } from './AdsCoreGerenteInventoryBar'
import { AdsCoreProdutorClient } from './AdsCoreProdutorClient'

// ─── Tipos ──────────────────────────────────────────────────────────────────

type ModuleItem = {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  desc: string
  badge?: string
  badgeColor?: string
}

type SectionGroup = {
  title: string
  subtitle: string
  accent: string
  items: ModuleItem[]
}

// ─── Dados dos grupos de módulos ─────────────────────────────────────────────

const GERENTE_GROUPS: SectionGroup[] = [
  {
    title: 'Ativos & Infraestrutura',
    subtitle: 'Pool de contas, nichos, identidade digital e documentos auditados',
    accent: 'border-l-blue-500',
    items: [
      {
        href: '/dashboard/ads-core/atribuicao',
        icon: Target,
        label: 'Estoque & Atribuição',
        desc: 'Visualize, edite e atribua contas a produtores. Cada edição gera auditoria.',
        badge: 'Central',
        badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      },
      {
        href: '/dashboard/ads-core/nichos',
        icon: FolderOpen,
        label: 'Nichos & Células',
        desc: 'Gerencie células de nicho (Google G2, Meta Business, TikTok) e colaboradores de cada célula.',
      },
      {
        href: '/dashboard/ads-core/rg-abastecimento',
        icon: Package,
        label: 'Abastecimento de RG',
        desc: 'Controle o estoque de RG disponível para criação e registro de novas contas.',
      },
      {
        href: '/dashboard/base',
        icon: Database,
        label: 'Base E-mails / CNPJs',
        desc: 'Pool de identidades únicas vigiado contra pegada digital. Nenhum dado pode ser reutilizado.',
      },
    ],
  },
  {
    title: 'Monitoramento & Inteligência',
    subtitle: 'Métricas de produção, demandas ativas e auditoria em tempo real',
    accent: 'border-l-emerald-500',
    items: [
      {
        href: '/dashboard/ads-core/bi',
        icon: BarChart3,
        label: 'Dashboard de Gestão',
        desc: 'Pipeline de produção, ranking de produtores, reprovações e KPIs da fábrica.',
        badge: 'Tempo real',
        badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      },
      {
        href: '/dashboard/ads-core/demandas',
        icon: LayoutList,
        label: 'Painel de Demandas',
        desc: 'Visão gerente de todas as demandas: pendentes, aprovadas e em execução.',
      },
      {
        href: '/dashboard/ads-core/relatorios-producao',
        icon: FileBarChart2,
        label: 'Relatórios & Auditoria',
        desc: 'Relatórios detalhados de produção com trilha de auditoria completa por colaborador.',
      },
    ],
  },
  {
    title: 'Contas MCC — Painel de Guerra',
    subtitle: 'Monitoramento centralizado de todas as contas Google Ads',
    accent: 'border-l-red-500',
    items: [
      {
        href: '/dashboard/ads-core/gestao-contas',
        icon: Layers,
        label: 'Contas MCC',
        desc: 'Central de comando para contas Google Ads. Alertas, status e gestão de todo o MCC em um painel.',
        badge: 'MCC',
        badgeColor: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      },
    ],
  },
]

// ─── Componente de card de módulo ────────────────────────────────────────────

function ModuleCard({ item }: { item: ModuleItem }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className="group flex items-start gap-3 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-ads-dark-card hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 hover:-translate-y-0.5 transition-all"
    >
      <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
        <Icon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.label}</span>
          {item.badge && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.badgeColor}`}>
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all mt-0.5" />
    </Link>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export function AdsCoreDashboardClient({ role }: { role?: string }) {
  const isGerente = role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
  const isProducer = role === 'PRODUCER'

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0 shadow-lg">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="heading-1 text-xl mb-0.5">ADS CORE</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400 mb-2">
            Cérebro operacional — inteligência, segregação e atribuição
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
            Motor de distribuição de ativos em escala. Identidade única por conta, células de nicho,
            ingestão em massa e anti-idle. CNPJ e domínio vigiados contra pegada digital.
            Acessos por role:{' '}
            <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">ADMIN</code>{' '}
            <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">PRODUCTION_MANAGER</code>{' '}
            <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">PRODUCER</code>
          </p>
        </div>
      </div>

      {/* Barra de inventário (apenas gerente) */}
      {isGerente && <AdsCoreGerenteInventoryBar />}

      {/* Módulos por seção (apenas gerente) */}
      {isGerente && (
        <div className="space-y-7">
          {GERENTE_GROUPS.map((group) => (
            <section key={group.title}>
              <div className={`pl-3 border-l-2 ${group.accent} mb-4`}>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{group.title}</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{group.subtitle}</p>
              </div>
              <div className={`grid gap-3 ${group.items.length === 1 ? 'grid-cols-1 max-w-lg' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {group.items.map((item) => (
                  <ModuleCard key={item.href} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Cadastro de ativo — entrada única (apenas gerente) */}
      {isGerente && (
        <section>
          <div className="pl-3 border-l-2 border-l-violet-500 mb-4">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Cadastro & Carimbo de Ativo</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Entrada única de conta — CNPJ consultado, nicho definido, colaborador atribuído
            </p>
          </div>
          <AdsCoreGerenteClient />
        </section>
      )}

      {/* Visão do produtor */}
      {isProducer && (
        <section>
          <div className="pl-3 border-l-2 border-l-amber-500 mb-4">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Esteira de Produção — sua visão
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Apenas ativos atribuídos a você. O nicho orienta congruência com o briefing.
              O domínio é editável com validação global de unicidade.
            </p>
          </div>
          <AdsCoreProdutorClient />
        </section>
      )}

      {!isGerente && !isProducer && (
        <p className="text-red-600 dark:text-red-400 text-sm">Seu perfil não tem acesso a este módulo.</p>
      )}
    </div>
  )
}
