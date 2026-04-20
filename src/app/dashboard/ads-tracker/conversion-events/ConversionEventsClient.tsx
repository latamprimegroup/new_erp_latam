'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'

type RuleRow = {
  id: string
  name: string
  slug: string
  active: boolean
  eventKind: string
  offerId: string | null
  offerName: string | null
  onlyApprovedPurchases: boolean
  upsellMode: string
  valueMode: string
  platformFeePercent: string | null
  conversionWeightPercent: number
  googleAdsCustomerId: string | null
  googleConversionActionId: string | null
  googleConversionLabel: string | null
  delayMinutesBeforeSend: number
  backendAction: string
  earlySignalMinSecondsOnPage: number | null
  dispatchCount: number
  updatedAt: string
}

type DispatchRow = {
  id: string
  ruleName: string
  status: string
  matchKind: string
  organic: boolean
  gclidOk: boolean
  valueComputed: string | null
  currency: string
  errorMessage: string | null
  orderHint: string | null
  createdAt: string
  processedAt: string | null
}

const EVENT_LABEL: Record<string, string> = {
  PURCHASE: 'Purchase',
  LEAD: 'Lead',
  INITIATE_CHECKOUT: 'InitiateCheckout',
  HIGH_INTENT_LEAD: 'Lead intenção (reservado)',
}

function triggerLabel(r: RuleRow): string {
  const parts: string[] = []
  if (r.eventKind === 'PURCHASE') {
    parts.push(r.onlyApprovedPurchases ? 'Só compras aprovadas' : 'Todas as compras (não recomendado)')
    if (r.upsellMode === 'PRIMARY_ONLY') parts.push('sem upsell')
    if (r.upsellMode === 'UPSELL_ONLY') parts.push('só upsell')
    if (r.upsellMode === 'INCLUDE_ALL') parts.push('principal + upsell')
  } else {
    parts.push('Gatilho ainda não ligado a ingestão')
  }
  if (r.offerId) parts.push(`oferta: ${r.offerName || r.offerId}`)
  else parts.push('todas as ofertas')
  return parts.join(' · ')
}

function valuePolicyLabel(r: RuleRow): string {
  const w = `${r.conversionWeightPercent}% peso`
  if (r.valueMode === 'MICRO_ZERO') return `Micro (0 valor) · ${w}`
  if (r.valueMode === 'NET_AFTER_PLATFORM_FEE') {
    return `Líquido pós-taxa${r.platformFeePercent != null ? ` (${r.platformFeePercent}%)` : ''} · ${w}`
  }
  return `Bruto · ${w}`
}

export function ConversionEventsClient({ canWrite }: { canWrite: boolean }) {
  const [rules, setRules] = useState<RuleRow[]>([])
  const [dispatches, setDispatches] = useState<DispatchRow[]>([])
  const [offers, setOffers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState<RuleRow | 'new' | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    Promise.all([
      fetch('/api/admin/conversion-rules').then((r) => r.json() as Promise<{ rules: RuleRow[] }>),
      fetch('/api/admin/conversion-dispatches/recent?take=10').then(
        (r) => r.json() as Promise<{ dispatches: DispatchRow[] }>
      ),
      fetch('/api/admin/tracker-offers').then((r) => r.json() as Promise<{ offers: { id: string; name: string }[] }>),
    ])
      .then(([a, b, c]) => {
        setRules(a.rules || [])
        setDispatches(b.dispatches || [])
        setOffers((c.offers || []).map((o) => ({ id: o.id, name: o.name })))
      })
      .catch(() => setErr('Falha ao carregar.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggleActive(r: RuleRow) {
    if (!canWrite) return
    await fetch(`/api/admin/conversion-rules/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !r.active }),
    })
    load()
  }

  async function delRule(id: string) {
    if (!canWrite || !confirm('Eliminar regra e histórico de fila associado?')) return
    const res = await fetch(`/api/admin/conversion-rules/${id}`, { method: 'DELETE' })
    if (!res.ok) setErr('Eliminar falhou')
    else load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        {canWrite && (
          <button
            type="button"
            onClick={() => setModal('new')}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nova regra
          </button>
        )}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <p className="text-[11px] text-zinc-500 border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
        Com pelo menos uma regra <strong className="text-zinc-400">PURCHASE</strong> ativa, o cron{' '}
        <code className="text-zinc-400">/api/cron/tracker-offers/google-offline</code> usa a fila (dedupe por regra +
        sinal). Sem regras ativas, mantém o modo legado por oferta. Deduplicação de vários boletos: um único{' '}
        <code className="text-zinc-400">sale_signal</code> por pedido (chave de dedupe no webhook).
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/90">
        <table className="w-full text-xs min-w-[960px]">
          <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="text-left p-2">Evento</th>
              <th className="text-left p-2">Gatilho</th>
              <th className="text-left p-2">Valor / peso</th>
              <th className="text-left p-2">Google (IDs)</th>
              <th className="text-left p-2">Atraso (min)</th>
              <th className="text-left p-2">Backend</th>
              <th className="text-center p-2">Ativo</th>
              <th className="text-left p-2 w-24">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rules.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-900/40">
                <td className="p-2">
                  <div className="text-zinc-200 font-medium">{r.name}</div>
                  <div className="text-[10px] text-zinc-500">{EVENT_LABEL[r.eventKind] || r.eventKind}</div>
                </td>
                <td className="p-2 text-zinc-400 max-w-[220px]">{triggerLabel(r)}</td>
                <td className="p-2 text-zinc-400">{valuePolicyLabel(r)}</td>
                <td className="p-2">
                  {r.googleAdsCustomerId && r.googleConversionActionId ? (
                    <span className="text-emerald-400/90 text-[11px]">Configurado</span>
                  ) : (
                    <span className="text-amber-200/80 text-[11px]">Pendente</span>
                  )}
                </td>
                <td className="p-2 font-mono text-zinc-300">{r.delayMinutesBeforeSend}</td>
                <td className="p-2 text-zinc-500 font-mono text-[10px]">{r.backendAction}</td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={r.active}
                    disabled={!canWrite}
                    onChange={() => void toggleActive(r)}
                    className="accent-primary-600"
                  />
                </td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setModal(r)}
                      className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-800"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => void delRule(r.id)}
                        className="p-1.5 rounded-md text-rose-400 hover:bg-zinc-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-2">Monitor de handshake (últimos 10)</h2>
        <p className="text-[11px] text-zinc-500 mb-3">
          Sem GCLID no sinal → <span className="text-zinc-400">ORGANIC_NO_GCLID</span> (não enviado como clique pago).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left py-2">Quando</th>
                <th className="text-left py-2">Regra</th>
                <th className="text-left py-2">Estado API</th>
                <th className="text-left py-2">Match</th>
                <th className="text-right py-2">Valor</th>
                <th className="text-left py-2">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {dispatches.map((d) => (
                <tr key={d.id}>
                  <td className="py-1.5 text-zinc-500 whitespace-nowrap">
                    {new Date(d.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-1.5 text-zinc-300">{d.ruleName}</td>
                  <td className="py-1.5 text-zinc-400">{d.status}</td>
                  <td className="py-1.5">
                    {d.organic ? (
                      <span className="text-amber-200/90">Orgânico (sem gclid)</span>
                    ) : d.gclidOk ? (
                      <span className="text-emerald-400/90">GCLID</span>
                    ) : (
                      <span className="text-zinc-500">{d.matchKind}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-mono text-zinc-400">
                    {d.valueComputed != null ? `${d.currency} ${d.valueComputed}` : '—'}
                  </td>
                  <td className="py-1.5 text-zinc-600 max-w-[180px] truncate" title={d.errorMessage || ''}>
                    {d.errorMessage || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <RuleModal
          initial={modal === 'new' ? null : modal}
          offers={offers}
          canWrite={canWrite}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function RuleModal({
  initial,
  offers,
  canWrite,
  onClose,
  onSaved,
}: {
  initial: RuleRow | null
  offers: { id: string; name: string }[]
  canWrite: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [slug, setSlug] = useState('')
  const [active, setActive] = useState(initial?.active ?? false)
  const [eventKind, setEventKind] = useState(initial?.eventKind || 'PURCHASE')
  const [offerId, setOfferId] = useState<string>(initial?.offerId || '')
  const [onlyApproved, setOnlyApproved] = useState(initial?.onlyApprovedPurchases ?? true)
  const [upsellMode, setUpsellMode] = useState(initial?.upsellMode || 'INCLUDE_ALL')
  const [valueMode, setValueMode] = useState(initial?.valueMode || 'FULL_GROSS')
  const [fee, setFee] = useState(initial?.platformFeePercent || '')
  const [weight, setWeight] = useState(String(initial?.conversionWeightPercent ?? 100))
  const [customerId, setCustomerId] = useState(initial?.googleAdsCustomerId || '')
  const [actionId, setActionId] = useState(initial?.googleConversionActionId || '')
  const [label, setLabel] = useState(initial?.googleConversionLabel || '')
  const [delayMin, setDelayMin] = useState(String(initial?.delayMinutesBeforeSend ?? 60))
  const [earlySec, setEarlySec] = useState(initial?.earlySignalMinSecondsOnPage != null ? String(initial.earlySignalMinSecondsOnPage) : '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!canWrite) return
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        active,
        eventKind,
        offerId: offerId || null,
        onlyApprovedPurchases: onlyApproved,
        upsellMode,
        valueMode,
        platformFeePercent: valueMode === 'NET_AFTER_PLATFORM_FEE' && fee.trim() ? fee.trim() : null,
        conversionWeightPercent: parseInt(weight, 10) || 0,
        googleAdsCustomerId: customerId.replace(/\D/g, '') || null,
        googleConversionActionId: actionId.trim() || null,
        googleConversionLabel: label.trim() || null,
        delayMinutesBeforeSend: parseInt(delayMin, 10) || 0,
        earlySignalMinSecondsOnPage: earlySec.trim() ? parseInt(earlySec, 10) : null,
        backendAction: 'OFFLINE_GCLIC_UPLOAD',
      }

      if (!initial) {
        const r = await fetch('/api/admin/conversion-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, slug: slug.trim() || undefined }),
        })
        if (!r.ok) {
          const j = (await r.json()) as { error?: string }
          alert(j.error || 'Erro')
          return
        }
        onSaved()
        return
      }

      const r = await fetch(`/api/admin/conversion-rules/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const j = (await r.json()) as { error?: string }
        alert(j.error || 'Erro')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 space-y-3 my-8 max-h-[92vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-white">{initial ? 'Editar regra' : 'Nova regra'}</h3>

        {!initial && (
          <label className="block text-xs space-y-1">
            <span className="text-zinc-400">Slug (opcional)</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          </label>
        )}

        <label className="block text-xs space-y-1">
          <span className="text-zinc-400">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canWrite}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={active} disabled={!canWrite} onChange={(e) => setActive(e.target.checked)} />
          Ativo
        </label>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1">
            <span className="text-zinc-400">Tipo</span>
            <select
              value={eventKind}
              onChange={(e) => setEventKind(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white"
            >
              <option value="PURCHASE">Purchase</option>
              <option value="LEAD">Lead</option>
              <option value="INITIATE_CHECKOUT">InitiateCheckout</option>
              <option value="HIGH_INTENT_LEAD">High intent (reservado)</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-zinc-400">Oferta (vazio = todas)</span>
            <select
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white"
            >
              <option value="">Todas</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {eventKind === 'PURCHASE' && (
          <>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={onlyApproved}
                disabled={!canWrite}
                onChange={(e) => setOnlyApproved(e.target.checked)}
              />
              Apenas vendas aprovadas (ignora boleto/Pix pendente)
            </label>
            <label className="space-y-1 text-xs block">
              <span className="text-zinc-400">Upsell vs principal</span>
              <select
                value={upsellMode}
                onChange={(e) => setUpsellMode(e.target.value)}
                disabled={!canWrite}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white"
              >
                <option value="INCLUDE_ALL">Incluir principal e upsell</option>
                <option value="PRIMARY_ONLY">Só principal (exclui upsell)</option>
                <option value="UPSELL_ONLY">Só upsell</option>
              </select>
            </label>
          </>
        )}

        <label className="space-y-1 text-xs block">
          <span className="text-zinc-400">Política de valor</span>
          <select
            value={valueMode}
            onChange={(e) => setValueMode(e.target.value)}
            disabled={!canWrite}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white"
          >
            <option value="FULL_GROSS">Valor bruto</option>
            <option value="NET_AFTER_PLATFORM_FEE">Líquido (descontar taxa % plataforma)</option>
            <option value="MICRO_ZERO">Micro-conversão (valor 0)</option>
          </select>
        </label>

        {valueMode === 'NET_AFTER_PLATFORM_FEE' && (
          <label className="space-y-1 text-xs block">
            <span className="text-zinc-400">Taxa plataforma (%)</span>
            <input
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              disabled={!canWrite}
              placeholder="ex.: 9.9"
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono"
            />
          </label>
        )}

        <label className="space-y-1 text-xs block">
          <span className="text-zinc-400">Peso da conversão (% do valor calculado)</span>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            disabled={!canWrite}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono"
          />
        </label>

        <div className="border border-zinc-800 rounded-lg p-3 space-y-2">
          <p className="text-[11px] font-medium text-zinc-400">Google Ads — conversão offline</p>
          <label className="space-y-1 text-xs block">
            <span className="text-zinc-400">Customer ID (só dígitos)</span>
            <input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          </label>
          <label className="space-y-1 text-xs block">
            <span className="text-zinc-400">Conversion Action ID (numérico)</span>
            <input
              value={actionId}
              onChange={(e) => setActionId(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          </label>
          <label className="space-y-1 text-xs block">
            <span className="text-zinc-400">Conversion label (referência / notas)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white text-xs"
            />
          </label>
        </div>

        <label className="space-y-1 text-xs block">
          <span className="text-zinc-400">Atraso antes do envio (minutos)</span>
          <input
            value={delayMin}
            onChange={(e) => setDelayMin(e.target.value)}
            disabled={!canWrite}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono"
          />
          <span className="text-[10px] text-zinc-600">Reconciliação / antifraude — não para “parecer humano”.</span>
        </label>

        <label className="space-y-1 text-xs block">
          <span className="text-zinc-400">Conversão preditiva — segundos mín. na página (reservado)</span>
          <input
            value={earlySec}
            onChange={(e) => setEarlySec(e.target.value)}
            disabled={!canWrite}
            placeholder="em breve"
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono opacity-60"
          />
        </label>

        {canWrite && (
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800">
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !name.trim()}
              onClick={() => void save()}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-40"
            >
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
