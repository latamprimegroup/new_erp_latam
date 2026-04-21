'use client'

import { useRef, useState } from 'react'
import { Search, ShieldAlert, TrendingUp, CheckCircle2, AlertTriangle, Loader2, Plus, Copy, CheckCheck } from 'lucide-react'

type PriceResult = {
  adsId: string; category: string; subCategory: string | null; status: string
  displayName: string; description: string | null; tags: string | null
  suggestedPrice: number; floorPrice: number | null
  pricing: { suggestedPrice: number; floorPrice: number | null; marginInfo: string; requiresApprovalBelow: number }
  sensitive?: { costPrice: number; markupPct: number | null; minMarginPct: number | null; grossMargin: number; grossMarginPct: number; vendor: { name: string; category: string; rating: number } | null }
}

type OrderResult = { id: string; adsId: string; status: string; negotiatedPrice: number }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_COLOR: Record<string, string> = { AVAILABLE: 'text-green-600', QUARANTINE: 'text-amber-600', SOLD: 'text-blue-600', DELIVERING: 'text-teal-600', DELIVERED: 'text-zinc-400', DEAD: 'text-red-600' }

export function ConsultaPrecoTab({ role }: { role: string }) {
  const hasSensitive = role === 'ADMIN' || role === 'PURCHASING'
  const canOrder     = role === 'ADMIN' || role === 'COMMERCIAL'

  const [query, setQuery]   = useState('')
  const [result, setResult] = useState<PriceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Formulário de OS
  const [showOrder, setShowOrder] = useState(false)
  const [price, setPrice]         = useState('')
  const [clientName, setClientName] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [ordering, setOrdering]   = useState(false)
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true); setError(null); setResult(null); setOrderResult(null)
    const r = await fetch(`/api/compras/ativos/${encodeURIComponent(query.trim())}/preco`)
    if (r.ok) {
      setResult(await r.json())
      if (result === null && !price) setPrice('')
    } else {
      const e = await r.json().catch(() => ({}))
      setError((e as { error?: string }).error ?? 'Ativo não encontrado')
    }
    setLoading(false)
  }

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault(); setOrdering(true)
    const negotiatedPrice = parseFloat(price)
    const r = await fetch('/api/vendas/ativos/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: result!.adsId, negotiatedPrice, clientName: clientName || undefined, clientContact: clientContact || undefined, notes: orderNotes || undefined }),
    })
    if (r.ok) {
      const j = await r.json()
      setOrderResult(j as OrderResult)
      setShowOrder(false)
    } else {
      const err = await r.json().catch(() => ({}))
      setError((err as { error?: string }).error ?? 'Erro ao criar OS')
    }
    setOrdering(false)
  }

  const floor       = result?.floorPrice ?? null
  const suggested   = result?.suggestedPrice ?? 0
  const negotiated  = parseFloat(price) || 0
  const belowFloor  = floor !== null && negotiated < floor && negotiated > 0
  const belowSugg   = negotiated > 0 && negotiated < suggested
  const pricePct    = suggested > 0 ? Math.round((negotiated / suggested) * 100) : 0

  const copyId = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.adsId)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Digite o <strong>ID Ads Ativos</strong> (ex: AA-CONT-000001) para consultar disponibilidade e faixa de preço. Dados de fornecedor e custo são ocultos.</span>
      </div>

      {/* Busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="AA-CONT-000001 ou qualquer ID..."
            className="input-field pl-9 py-3 text-base font-mono w-full"
            autoFocus
          />
        </div>
        <button onClick={search} disabled={loading || !query.trim()}
          className="btn-primary px-6 flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Consultar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/10 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {orderResult && (
        <div className="rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/10 p-4 text-sm text-green-700">
          <p className="font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />OS Criada com Sucesso!</p>
          <p className="mt-1 font-mono text-xs">ID: {orderResult.id}</p>
          <p className="text-xs">Status: {orderResult.status === 'PENDING_APPROVAL' ? '⚠️ Aguardando Aprovação (preço abaixo do piso)' : '⏳ Aguardando Pagamento do Cliente'}</p>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-indigo-600 text-white p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-lg tracking-wider">{result.adsId}</span>
                  <button onClick={copyId} className="p-1 hover:bg-white/20 rounded transition-colors">
                    {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-sm opacity-80">{result.displayName}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-bold bg-white/20 ${STATUS_COLOR[result.status] ?? 'text-white'}`}>
                {result.status}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Categoria e tags */}
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">{result.category}</span>
              {result.subCategory && <span className="px-2 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs">{result.subCategory}</span>}
              {result.tags && result.tags.split(',').map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs">{t.trim()}</span>
              ))}
            </div>

            {result.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{result.description}</p>}

            {/* Faixas de preço */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-primary-50 dark:bg-primary-950/20 border border-primary-200 p-4 text-center">
                <p className="text-xs font-semibold text-primary-600 uppercase mb-1">Preço Sugerido</p>
                <p className="text-2xl font-bold text-primary-700">{brl(result.suggestedPrice)}</p>
              </div>
              <div className={`rounded-xl border p-4 text-center ${result.floorPrice ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200'}`}>
                <p className="text-xs font-semibold text-amber-600 uppercase mb-1">Preço Mínimo (Piso)</p>
                <p className="text-2xl font-bold text-amber-700">{result.floorPrice ? brl(result.floorPrice) : '—'}</p>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 text-xs text-zinc-600">
              💡 {result.pricing.marginInfo}
            </div>

            {/* Dados sensíveis (PURCHASING/ADMIN) */}
            {hasSensitive && result.sensitive && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/10 p-4 space-y-2">
                <p className="text-xs font-bold text-amber-700 uppercase flex items-center gap-1">🔒 Dados Internos (Confidencial)</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-zinc-500">Custo</p>
                    <p className="font-bold text-red-600">{brl(result.sensitive.costPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500">Margem Bruta</p>
                    <p className="font-bold text-green-600">{brl(result.sensitive.grossMargin)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500">Margem %</p>
                    <p className="font-bold">{result.sensitive.grossMarginPct.toFixed(1)}%</p>
                  </div>
                </div>
                {result.sensitive.vendor && (
                  <p className="text-xs text-zinc-500">Fornecedor: <strong>{result.sensitive.vendor.name}</strong> · Rating: {result.sensitive.vendor.rating}/10</p>
                )}
              </div>
            )}

            {/* Formulário de OS */}
            {canOrder && result.status === 'AVAILABLE' && !orderResult && (
              <div>
                {!showOrder
                  ? <button onClick={() => { setShowOrder(true); setPrice(String(result.suggestedPrice)) }}
                      className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold flex items-center justify-center gap-2 transition-colors">
                      <Plus className="w-4 h-4" />Gerar Ordem de Serviço
                    </button>
                  : (
                    <form onSubmit={handleOrder} className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 space-y-3">
                      <h3 className="font-bold text-sm">Nova Ordem de Serviço</h3>

                      <div>
                        <label className="block text-xs font-semibold mb-1">Preço Negociado (R$) *</label>
                        <input required type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input-field font-mono" />

                        {/* Indicador visual de margem */}
                        {negotiated > 0 && (
                          <div className={`mt-2 rounded-lg p-2 text-xs flex items-center gap-2 ${belowFloor ? 'bg-red-50 border border-red-200 text-red-700' : belowSugg ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                            {belowFloor
                              ? <><ShieldAlert className="w-3.5 h-3.5 shrink-0" /><span><strong>Abaixo do Piso!</strong> Esta venda exigirá aprovação do CEO antes de prosseguir.</span></>
                              : belowSugg
                                ? <><TrendingUp className="w-3.5 h-3.5 shrink-0" /><span>Desconto de {100 - pricePct}% concedido. Dentro da margem mínima.</span></>
                                : <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /><span>Preço acima do sugerido — excelente negociação!</span></>
                            }
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold mb-1">Nome do Cliente</label>
                          <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="input-field" placeholder="Ex: João Silva" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1">Contato (WhatsApp/E-mail)</label>
                          <input value={clientContact} onChange={(e) => setClientContact(e.target.value)} className="input-field" placeholder="+55..." />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Observações</label>
                        <input value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="input-field" />
                      </div>

                      <div className="flex gap-2">
                        <button type="submit" disabled={ordering} className="flex-1 btn-primary flex items-center justify-center gap-1.5">
                          {ordering ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {belowFloor ? 'Enviar para Aprovação' : 'Confirmar Venda'}
                        </button>
                        <button type="button" onClick={() => setShowOrder(false)} className="btn-secondary">Cancelar</button>
                      </div>
                    </form>
                  )
                }
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
