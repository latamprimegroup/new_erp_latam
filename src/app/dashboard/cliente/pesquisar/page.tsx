'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const PLATFORMS = [
  { value: '', label: 'Todos' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'KWAI_ADS', label: 'Kwai Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
]

type Account = {
  id: string
  platform: string
  platformLabel: string
  type: string
  yearStarted: number | null
  niche: string | null
  minConsumed: number | null
  spent: number | null
  salePrice: number | null
  description: string | null
  isPlugPlay: boolean
  g2Status?: 'PENDING' | 'APPROVED' | 'REJECTED'
  firstWhiteCampaign?: boolean
  approvalDate?: string | null
  isPremium?: boolean
}

export default function PesquisarContasPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    platform: '',
    type: '',
    yearMin: '',
    consumoMin: '',
    niche: '',
    plugPlayOnly: false,
  })
  const [cotando, setCotando] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.platform) params.set('platform', filters.platform)
    if (filters.type) params.set('type', filters.type)
    if (filters.yearMin) params.set('yearMin', filters.yearMin)
    if (filters.consumoMin) params.set('consumoMin', filters.consumoMin)
    if (filters.niche) params.set('niche', filters.niche)
    if (filters.plugPlayOnly) params.set('plugPlayOnly', 'true')
    const res = await fetch(`/api/cliente/catalogo?${params}`)
    const data = await res.json()
    if (res.ok && Array.isArray(data)) setAccounts(data)
    else setAccounts([])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [filters.platform, filters.type, filters.yearMin, filters.consumoMin, filters.niche, filters.plugPlayOnly])

  async function solicitarCotacao(account: Account) {
    setCotando(account.id)
    const res = await fetch('/api/cliente/cotacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: account.id }),
    })
    const data = await res.json()
    setCotando(null)
    if (res.ok && data.whatsappUrl) {
      window.open(data.whatsappUrl, '_blank')
    } else {
      alert(data.error || 'Erro ao solicitar cotação')
    }
  }

  function diasDesdeAprovacao(dataIso: string | null | undefined): number | null {
    if (!dataIso) return null
    const diff = Date.now() - new Date(dataIso).getTime()
    if (Number.isNaN(diff)) return null
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/cliente" className="text-gray-500 hover:text-gray-700">
          ← Voltar
        </Link>
        <h1 className="heading-1">
          Pesquisar Contas Disponíveis
        </h1>
      </div>

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Plataforma</label>
            <select
              value={filters.platform}
              onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}
              className="input-field"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value || 'all'} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Tipo</label>
            <input
              type="text"
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
              className="input-field"
              placeholder="Ex: Ads USD"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Ano mínimo</label>
            <input
              type="number"
              value={filters.yearMin}
              onChange={(e) => setFilters((f) => ({ ...f, yearMin: e.target.value }))}
              className="input-field"
              placeholder="2016"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Consumo mín. (R$)</label>
            <input
              type="number"
              value={filters.consumoMin}
              onChange={(e) => setFilters((f) => ({ ...f, consumoMin: e.target.value }))}
              className="input-field"
              placeholder="5000"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Nicho</label>
            <input
              type="text"
              value={filters.niche}
              onChange={(e) => setFilters((f) => ({ ...f, niche: e.target.value }))}
              className="input-field"
              placeholder="Saúde, E-commerce..."
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 px-3 py-2 rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.plugPlayOnly}
                onChange={(e) => setFilters((f) => ({ ...f, plugPlayOnly: e.target.checked }))}
              />
              Apenas Contas Prontas (Plug & Play)
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Contas Encontradas</h2>
        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : accounts.length === 0 ? (
          <p className="text-gray-400 py-8">Nenhuma conta disponível com os filtros selecionados.</p>
        ) : (
          <div className="space-y-4">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="p-4 border border-primary-600/10 rounded-lg flex flex-wrap justify-between items-center gap-4"
              >
                <div className="flex-1">
                  <p className="font-medium">
                    {a.platformLabel} — {a.type}
                    {a.isPremium && (
                      <span className="ml-2 inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-300">
                        Premium
                      </span>
                    )}
                    {a.isPlugPlay && (
                      <span className="ml-2 inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                        [PLUG & PLAY]
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    Ano: {a.yearStarted || '—'} | Nicho: {a.niche || '—'} | Consumo mín:{' '}
                    {a.minConsumed != null ? `R$ ${a.minConsumed.toLocaleString('pt-BR')}` : '—'}
                    {a.spent != null && a.spent > 0
                      ? ` | Gasto hist.: R$ ${a.spent.toLocaleString('pt-BR')}`
                      : ''}
                  </p>
                  {a.description && <p className="text-sm text-gray-600 mt-1">{a.description}</p>}
                  {a.isPlugPlay && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-2 font-medium">
                      ✓ Conta G2 verificada + Campanha White aprovada. Pronta para troca de domínio/criativo.
                      {diasDesdeAprovacao(a.approvalDate) != null
                        ? ` Maturando há ${diasDesdeAprovacao(a.approvalDate)} dia(s).`
                        : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {a.salePrice != null && a.salePrice > 0 ? (
                    <span className="text-lg font-bold text-primary-600">
                      R$ {a.salePrice.toLocaleString('pt-BR')}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">Consulte preço</span>
                  )}
                  <button
                    onClick={() => solicitarCotacao(a)}
                    disabled={!!cotando}
                    className="btn-primary"
                  >
                    {cotando === a.id ? 'Abrindo...' : 'Solicitar Cotação via WhatsApp'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
