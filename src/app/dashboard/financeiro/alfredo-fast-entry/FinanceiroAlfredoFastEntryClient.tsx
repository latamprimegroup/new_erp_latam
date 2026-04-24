'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlfredoFastEntry } from '@/app/dashboard/ceo/AlfredoFastEntry'
import { PersonalFastEntry } from '@/app/dashboard/socio/SocioDashboard'

type FinanceDraft = {
  id: string
  type: 'ENTRADA' | 'SAIDA'
  status: string
  extractedAmount: number | null
  extractedCurrency: string | null
  extractedDate: string | null
  extractedName: string | null
  extractedTransactionId: string | null
  extractedCategory: string | null
  extractedPaymentMethod: string | null
  extractedDescription: string | null
  aiConfidence: number
  hadImage: boolean
  createdEntryId: string | null
  createdAt: string
  createdBy?: { name: string | null } | null
}

type SocioEntry = {
  id: string
  type: 'RECEITA' | 'DESPESA'
  category: string
  amount: number
  currency: string
  date: string
  description: string | null
  paymentMethod: string | null
  externalTxId: string | null
  aiExtracted: boolean
}

type SocioEntriesResponse = {
  entries: SocioEntry[]
  total: number
  page: number
  pages: number
  totals: {
    income: number
    expense: number
    balance: number
  }
}

type Tab = 'empresa' | 'pessoal' | 'historico' | 'whatsapp'
type HistFilter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'DUPLICATE'

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function statusPill(status: string): string {
  if (status === 'CONFIRMED') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (status === 'PENDING') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
  if (status === 'DUPLICATE') return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
  if (status === 'REJECTED') return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
  return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
}

export function FinanceiroAlfredoFastEntryClient() {
  const [tab, setTab] = useState<Tab>('empresa')
  const [historyFilter, setHistoryFilter] = useState<HistFilter>('ALL')
  const [financeDrafts, setFinanceDrafts] = useState<FinanceDraft[]>([])
  const [socioEntries, setSocioEntries] = useState<SocioEntry[]>([])
  const [socioTotals, setSocioTotals] = useState<SocioEntriesResponse['totals'] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    setError(null)
    try {
      const financeUrl =
        historyFilter === 'ALL'
          ? '/api/alfredo/fast-entry?limit=30'
          : `/api/alfredo/fast-entry?limit=30&status=${historyFilter}`

      const [financeRes, socioRes] = await Promise.all([
        fetch(financeUrl, { cache: 'no-store' }),
        fetch('/api/socio/entries?page=1', { cache: 'no-store' }),
      ])

      const financeJson = (await financeRes.json()) as FinanceDraft[] | { error?: string }
      const socioJson = (await socioRes.json()) as SocioEntriesResponse | { error?: string }

      if (!financeRes.ok) {
        throw new Error((financeJson as { error?: string }).error || 'Erro ao carregar histórico empresa')
      }
      if (!socioRes.ok) {
        throw new Error((socioJson as { error?: string }).error || 'Erro ao carregar histórico pessoal')
      }

      setFinanceDrafts(Array.isArray(financeJson) ? financeJson : [])
      const socioData = socioJson as SocioEntriesResponse
      setSocioEntries(Array.isArray(socioData.entries) ? socioData.entries : [])
      setSocioTotals(socioData.totals ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórico do Fast-Entry')
    } finally {
      setLoadingHistory(false)
    }
  }, [historyFilter])

  useEffect(() => {
    if (tab !== 'historico') return
    loadHistory()
  }, [tab, loadHistory])

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'empresa'   as const, label: 'Empresa' },
            { id: 'pessoal'   as const, label: 'Pessoal' },
            { id: 'historico' as const, label: 'Histórico' },
            { id: 'whatsapp'  as const, label: '📱 WhatsApp' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === item.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'empresa' && (
        <section className="space-y-3">
          <div className="card">
            <h2 className="heading-2">ALFREDO Fast-Entry — Empresa</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Zero Entry Policy corporativo: cole comprovante (texto/foto), revise e confirme o lançamento no financeiro da empresa.
            </p>
          </div>
          <div className="card max-w-3xl">
            <AlfredoFastEntry compact={false} />
          </div>
        </section>
      )}

      {tab === 'pessoal' && (
        <section className="space-y-3">
          <div className="card">
            <h2 className="heading-2">ALFREDO Fast-Entry — Pessoal</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Lançamentos pessoais do sócio com IA, separados do caixa da empresa.
            </p>
          </div>
          <div className="card max-w-3xl space-y-3">
            <PersonalFastEntry onSaved={loadHistory} />
            <p className="text-xs text-gray-500">
              Para gestão completa de patrimônio, projeção pessoal e transferências internas, use também o módulo
              Wealth.
            </p>
            <a href="/dashboard/socio" className="btn-secondary inline-flex text-sm">
              Abrir Wealth completo
            </a>
          </div>
        </section>
      )}

      {tab === 'historico' && (
        <section className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="heading-2">Histórico Fast-Entry</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Acompanhe os lançamentos automáticos da empresa e pessoais.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="input-field text-sm w-[180px]"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value as HistFilter)}
                >
                  <option value="ALL">Empresa: todos status</option>
                  <option value="PENDING">Empresa: pendente</option>
                  <option value="CONFIRMED">Empresa: confirmado</option>
                  <option value="REJECTED">Empresa: rejeitado</option>
                  <option value="DUPLICATE">Empresa: duplicata</option>
                </select>
                <button type="button" onClick={loadHistory} className="btn-secondary text-sm">
                  Atualizar
                </button>
              </div>
            </div>
            {error ? (
              <p className="text-sm text-red-600 mt-3">{error}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-semibold mb-3">Empresa — últimos drafts</h3>
              {loadingHistory ? (
                <p className="text-sm text-gray-500">Carregando...</p>
              ) : financeDrafts.length === 0 ? (
                <p className="text-sm text-gray-500">Sem lançamentos para o filtro selecionado.</p>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto">
                  {financeDrafts.map((d) => (
                    <div key={d.id} className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusPill(d.status)}`}>
                            {d.status}
                          </span>
                          {(d as FinanceDraft & { source?: string }).source === 'WHATSAPP' && (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300">
                              📱 WhatsApp
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">{new Date(d.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-sm font-semibold mt-1">
                        {d.type} · {d.extractedAmount != null ? BRL(Number(d.extractedAmount)) : '—'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {d.extractedName || d.extractedDescription || 'Sem descrição'}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Categoria: {d.extractedCategory || '—'} · Método: {d.extractedPaymentMethod || '—'} · Confiança:{' '}
                        {d.aiConfidence}%
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Pessoal — últimos lançamentos</h3>
                {socioTotals ? (
                  <span className="text-xs text-gray-500">
                    Saldo: {BRL(Number(socioTotals.balance ?? 0))}
                  </span>
                ) : null}
              </div>
              {loadingHistory ? (
                <p className="text-sm text-gray-500">Carregando...</p>
              ) : socioEntries.length === 0 ? (
                <p className="text-sm text-gray-500">Sem lançamentos pessoais recentes.</p>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto">
                  {socioEntries.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            entry.type === 'RECEITA'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          }`}
                        >
                          {entry.type}
                        </span>
                        <span className="text-xs text-gray-500">{new Date(entry.date).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-sm font-semibold mt-1">{BRL(Number(entry.amount))}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {entry.category} · {entry.paymentMethod || 'OUTRO'} {entry.aiExtracted ? '· ⚡ IA' : ''}
                      </p>
                      {entry.description ? (
                        <p className="text-xs text-gray-500 mt-1">{entry.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'whatsapp' && (
        <section className="space-y-4 max-w-2xl">
          <div className="card border-l-4 border-l-green-500">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center text-xl">📱</div>
              <div>
                <h2 className="heading-2">ALFREDO via WhatsApp</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Zero Entry Policy — cole o comprovante direto no WhatsApp</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Configure a integração abaixo e envie qualquer comprovante (PIX, TED, fatura) para o número do ALFREDO no WhatsApp.
              A IA extrai os dados automaticamente e cria o rascunho aqui. Você só precisa revisar e confirmar.
            </p>
          </div>

          <div className="card space-y-4">
            <h3 className="font-semibold text-base">Como funciona</h3>
            <ol className="space-y-3 text-sm">
              {[
                { n: '1', title: 'Envie o comprovante', desc: 'Tire uma foto ou cole o texto do comprovante (PIX, TED, boleto) no WhatsApp do ALFREDO.' },
                { n: '2', title: 'ALFREDO IA processa', desc: 'Em segundos, a IA lê o comprovante (imagem ou texto) e extrai: valor, data, categoria, método de pagamento e ID da transação.' },
                { n: '3', title: 'Rascunho criado', desc: 'Um rascunho aparece automaticamente na aba Histórico com badge 📱 WhatsApp.' },
                { n: '4', title: 'Você confirma', desc: 'Acesse o Histórico, revise os dados e clique em Confirmar. O lançamento entra no financeiro da empresa.' },
              ].map((step) => (
                <li key={step.n} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {step.n}
                  </div>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="text-gray-500 dark:text-gray-400">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="card space-y-3">
            <h3 className="font-semibold text-base">Configuração (DevOps)</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Adicione as seguintes variáveis de ambiente na Vercel e configure o webhook na Evolution API:
            </p>
            <div className="rounded-lg bg-zinc-900 text-green-400 font-mono text-xs p-4 space-y-1 overflow-x-auto">
              <p># Evolution API</p>
              <p>EVOLUTION_API_URL=https://sua-evolution.com</p>
              <p>EVOLUTION_API_KEY=sua-api-key</p>
              <p>EVOLUTION_INSTANCE=alfredo</p>
              <p>EVOLUTION_WEBHOOK_SECRET=secret-seguro-aqui</p>
              <p className="mt-2"># Números autorizados (vírgula = separador)</p>
              <p>ALFREDO_ALLOWED_PHONES=5511999999999,5521888888888</p>
              <p className="mt-2"># ID do usuário ADMIN/FINANCE que recebe os drafts</p>
              <p>ALFREDO_ADMIN_USER_ID=cuid-do-usuario-aqui</p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-sm">
              <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1">URL do Webhook (Evolution API)</p>
              <code className="text-blue-700 dark:text-blue-400 break-all">
                https://www.adsativos.com/api/webhooks/evolution/fast-entry
              </code>
              <p className="text-blue-600 dark:text-blue-400 mt-2 text-xs">
                No painel da Evolution API: Instância → Webhooks → URL acima, eventos: <strong>messages.upsert</strong>
              </p>
            </div>
          </div>

          <div className="card space-y-2">
            <h3 className="font-semibold text-base">Tipos de mensagem suportados</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { icon: '📝', label: 'Texto colado', desc: 'Cole o texto do comprovante' },
                { icon: '📸', label: 'Foto do comprovante', desc: 'Tire foto do recibo ou tela' },
                { icon: '🖼️', label: 'Screenshot', desc: 'Print do PIX, TED ou boleto' },
                { icon: '📄', label: 'Texto com legenda', desc: 'Documento com descrição' },
              ].map((item) => (
                <div key={item.icon} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-white/5">
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <p className="font-medium text-xs">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
