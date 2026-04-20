'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type LeadRow = {
  id: string
  buyerHint: string
  totalGross: string
  purchaseCount: number
  currency: string
  attributedCampaignId: string | null
  attributedOfferId: string | null
  firstPurchaseAt: string
  lastPurchaseAt: string
}

type CampaignRow = {
  campaignId: string | null
  totalGross: string
  purchaseCount: number
}

export function LtvAttributionClient() {
  const [topLeads, setTopLeads] = useState<LeadRow[]>([])
  const [byCampaign, setByCampaign] = useState<CampaignRow[]>([])
  const [purchaseTotal, setPurchaseTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    setErr(null)
    fetch('/api/admin/ads-tracker/ltv/overview')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<{
          topLeads: LeadRow[]
          byCampaign: CampaignRow[]
          purchaseTotal: number
        }>
      })
      .then((j) => {
        setTopLeads(j.topLeads || [])
        setByCampaign(j.byCampaign || [])
        setPurchaseTotal(j.purchaseTotal ?? 0)
      })
      .catch(() => setErr('Não foi possível carregar o relatório LTV.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      {err && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </p>
      )}

      <p className="text-[11px] text-zinc-500 leading-relaxed border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
        Cada venda <strong>aprovada</strong> no webhook de ofertas (Módulo 10) com e-mail ou CPF identificável regista uma
        linha de compra. O LTV é somado por identidade; a <strong>primeira campanha</strong> indicada no postback (
        <code className="text-zinc-400">ads_tracker_campaign_id</code> ou equivalente) fica como atribuição se ainda não
        existir.
      </p>

      <div className="flex flex-wrap gap-4 items-center">
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            load()
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        <span className="text-xs text-zinc-500">Linhas de compra indexadas: {purchaseTotal}</span>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Por campanha (soma LTV atribuída)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left p-2">Campaign ID</th>
                <th className="text-right p-2">Compras</th>
                <th className="text-right p-2">Total bruto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {byCampaign.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-4 text-zinc-500 text-center">
                    Sem atribuição a campanha — envie o id da campanha no postback.
                  </td>
                </tr>
              ) : (
                byCampaign.map((r, i) => (
                  <tr key={r.campaignId ?? `row-${i}`} className="hover:bg-zinc-900/40">
                    <td className="p-2 font-mono text-zinc-200">{r.campaignId || '—'}</td>
                    <td className="p-2 text-right text-zinc-400">{r.purchaseCount}</td>
                    <td className="p-2 text-right font-mono text-emerald-400/90">
                      {r.totalGross} {topLeads[0]?.currency ?? 'BRL'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Top leads por LTV</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[800px]">
            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left p-2">Identidade (mascarada)</th>
                <th className="text-right p-2">Compras</th>
                <th className="text-right p-2">LTV bruto</th>
                <th className="text-left p-2">Campanha</th>
                <th className="text-left p-2">Oferta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {topLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-zinc-500">
                    {loading ? 'A carregar…' : 'Sem dados LTV ainda.'}
                  </td>
                </tr>
              ) : (
                topLeads.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-900/40">
                    <td className="p-2 text-zinc-200">{r.buyerHint}</td>
                    <td className="p-2 text-right text-zinc-400">{r.purchaseCount}</td>
                    <td className="p-2 text-right font-mono text-emerald-400/90">
                      {r.totalGross} {r.currency}
                    </td>
                    <td className="p-2 font-mono text-zinc-500 text-[10px]">{r.attributedCampaignId || '—'}</td>
                    <td className="p-2 font-mono text-zinc-500 text-[10px]">{r.attributedOfferId || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
