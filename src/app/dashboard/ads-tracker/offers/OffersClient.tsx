'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Copy, Pencil, RefreshCw, Settings2, Trash2 } from 'lucide-react'

type OfferRow = {
  id: string
  name: string
  platform: string
  status: string
  revenueTotal: string
  approvedSalesCount: number
  gclidMatchedSalesCount: number
  gclidMatchPct: number | null
  trackingLossAlert: boolean
  lastWebhookAt: string | null
  lastWebhookOk: boolean | null
  postbackUrl: string | null
  payUrl: string | null
  clickIdField: string
  checkoutTargetUrl: string
  paySlug: string
  googleOfflineDelayMinutes: number
  referenceGrossBrl: string | null
  updatedAt: string
}

type SaleSignal = {
  id: string
  amountGross: string
  currency: string
  paymentState: string
  gclidPresent: boolean
  countedForRevenue: boolean
  googleOfflineSentAt: string | null
  googleOfflineError: string | null
  createdAt: string
}

const PLATFORMS = ['KIWIFY', 'HOTMART', 'EDUZZ', 'KIRVANO', 'PERFECT_PAY', 'OTHER'] as const
const STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const
const CLICK_PRESETS = [
  { value: 'auto', label: 'Automático (heurística gclid / aninhado)' },
  { value: 'gclid', label: 'gclid (raiz)' },
  { value: 'click_id', label: 'click_id' },
  { value: 'GCLID', label: 'GCLID' },
  { value: 'data.gclid', label: 'data.gclid' },
  { value: 'data.tracking.gclid', label: 'data.tracking.gclid' },
  { value: 'utm_term', label: 'utm_term (se transportar gclid)' },
]

async function copyText(text: string) {
  await navigator.clipboard.writeText(text).catch(() => {})
}

export function OffersClient({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<OfferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [signals, setSignals] = useState<SaleSignal[]>([])
  const [signalsLoading, setSignalsLoading] = useState(false)

  const [editOpen, setEditOpen] = useState<OfferRow | 'new' | null>(null)
  const [configOffer, setConfigOffer] = useState<OfferRow | null>(null)
  const [bootstrap, setBootstrap] = useState<{
    postbackUrl: string | null
    payUrl: string | null
    webhookSecret: string
    warning?: string
  } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    fetch('/api/admin/tracker-offers')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<{ offers: OfferRow[] }>
      })
      .then((j) => setRows(j.offers || []))
      .catch(() => setErr('Não foi possível carregar ofertas.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadSignals = useCallback((id: string) => {
    setSignalsLoading(true)
    fetch(`/api/admin/tracker-offers/${id}/signals?take=50`)
      .then((r) => r.json() as Promise<{ signals: SaleSignal[] }>)
      .then((j) => setSignals(j.signals || []))
      .catch(() => setSignals([]))
      .finally(() => setSignalsLoading(false))
  }, [])

  useEffect(() => {
    if (selectedId) loadSignals(selectedId)
    else setSignals([])
  }, [selectedId, loadSignals])

  async function delRow(id: string) {
    if (!confirm('Eliminar esta oferta e todo o histórico de sinais?')) return
    const r = await fetch(`/api/admin/tracker-offers/${id}`, { method: 'DELETE' })
    if (!r.ok) setErr('Eliminar falhou.')
    else {
      if (selectedId === id) setSelectedId(null)
      load()
    }
  }

  function webhookLabel(o: OfferRow): string {
    if (o.lastWebhookAt == null) return 'Sem eventos'
    if (o.lastWebhookOk === false) return 'Última falha'
    return 'OK'
  }

  return (
    <div className="space-y-4">
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
            onClick={() => setEditOpen('new')}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium"
          >
            Nova oferta
          </button>
        )}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <p className="text-[11px] text-zinc-500 border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
        HMAC opcional: envie cabeçalho <code className="text-zinc-400">X-Tracker-Signature</code> com hex SHA-256
        HMAC do corpo bruto usando o segredo. IP: defina <code className="text-zinc-400">TRACKER_OFFER_WEBHOOK_IPS</code>{' '}
        e <code className="text-zinc-400">TRACKER_OFFER_IP_MODE</code> (off | soft | strict). Atraso offline: minutos
        antes do cron tentar Google (antifraude / processamento), não para simular utilizador.
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/90">
        <table className="w-full text-xs min-w-[1050px]">
          <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="text-left p-2 w-32">Ações</th>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Oferta</th>
              <th className="text-left p-2">Plataforma</th>
              <th className="text-right p-2">Receita (aprov.)</th>
              <th className="text-left p-2">Webhook</th>
              <th className="text-left p-2">Match GCLID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">
                  Sem ofertas.
                </td>
              </tr>
            )}
            {rows.map((o) => (
              <tr
                key={o.id}
                className={`cursor-pointer hover:bg-zinc-900/40 ${selectedId === o.id ? 'bg-zinc-900/60' : ''}`}
                onClick={() => setSelectedId(o.id)}
              >
                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      title="Configurar postback"
                      onClick={() => setConfigOffer(o)}
                      className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => setEditOpen(o)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canWrite && (
                      <button
                        type="button"
                        title="Eliminar"
                        onClick={() => void delRow(o.id)}
                        className="p-1.5 rounded-md text-rose-400 hover:bg-zinc-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="p-2 font-mono text-zinc-500 max-w-[72px] truncate" title={o.id}>
                  {o.id.slice(0, 8)}…
                </td>
                <td className="p-2 text-zinc-200 font-medium max-w-[160px] truncate" title={o.name}>
                  {o.name}
                </td>
                <td className="p-2 text-zinc-400">{o.platform}</td>
                <td className="p-2 text-right font-mono text-emerald-200/90">
                  R${' '}
                  {Number(o.revenueTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="p-2">
                  <span
                    className={
                      o.lastWebhookOk === false
                        ? 'text-rose-400'
                        : o.lastWebhookAt
                          ? 'text-emerald-300/90'
                          : 'text-zinc-500'
                    }
                  >
                    {webhookLabel(o)}
                  </span>
                  <div className="text-[10px] text-zinc-600 truncate max-w-[140px]" title={o.lastWebhookAt || ''}>
                    {o.lastWebhookAt ? new Date(o.lastWebhookAt).toLocaleString('pt-BR') : '—'}
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    {o.gclidMatchPct != null ? (
                      <span className="font-mono text-zinc-300">
                        {(o.gclidMatchPct * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                    {o.trackingLossAlert && (
                      <span
                        className="inline-flex items-center gap-0.5 text-amber-400 text-[10px]"
                        title="Perda de rastreio: poucas vendas aprovadas com GCLID face ao total"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Perda
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-600">
                    {o.gclidMatchedSalesCount}/{o.approvedSalesCount} vendas
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bootstrap && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-800 bg-zinc-950 p-6 space-y-3">
            <h3 className="text-lg font-semibold text-emerald-200">Oferta criada — guarde o segredo</h3>
            {bootstrap.warning && <p className="text-xs text-amber-200/90">{bootstrap.warning}</p>}
            <FieldCopy label="URL postback" value={bootstrap.postbackUrl || '(defina NEXT_PUBLIC_APP_URL)'} />
            <FieldCopy label="Link checkout (domínio próprio)" value={bootstrap.payUrl || '(defina NEXT_PUBLIC_APP_URL)'} />
            <FieldCopy label="Secret (HMAC opcional)" value={bootstrap.webhookSecret} />
            <button
              type="button"
              className="mt-2 w-full py-2 rounded-lg bg-zinc-800 text-white text-sm"
              onClick={() => setBootstrap(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {configOffer && (
        <ConfigModal
          offer={configOffer}
          onClose={() => setConfigOffer(null)}
        />
      )}

      {editOpen && (
        <EditModal
          initial={editOpen === 'new' ? null : editOpen}
          canWrite={canWrite}
          onClose={() => setEditOpen(null)}
          onSaved={(bootstrapData) => {
            setEditOpen(null)
            if (bootstrapData) {
              setBootstrap({
                postbackUrl: bootstrapData.postbackUrl,
                payUrl: bootstrapData.payUrl,
                webhookSecret: bootstrapData.webhookSecret,
                warning: bootstrapData.warning,
              })
            }
            load()
          }}
        />
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-2">Sinais de venda (S2S)</h2>
        {!selectedId && <p className="text-xs text-zinc-500">Selecione uma linha na tabela.</p>}
        {selectedId && signalsLoading && <p className="text-xs text-zinc-500">A carregar…</p>}
        {selectedId && !signalsLoading && signals.length === 0 && (
          <p className="text-xs text-zinc-500">Sem sinais ainda.</p>
        )}
        {selectedId && !signalsLoading && signals.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="text-left py-2">Quando</th>
                  <th className="text-right py-2">Valor</th>
                  <th className="text-left py-2">Estado</th>
                  <th className="text-center py-2">GCLID</th>
                  <th className="text-left py-2">Google offline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {signals.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5 text-zinc-400 whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-1.5 text-right font-mono text-zinc-200">
                      {s.currency} {Number(s.amountGross).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-1.5 text-zinc-300">{s.paymentState}</td>
                    <td className="py-1.5 text-center">{s.gclidPresent ? 'sim' : 'não'}</td>
                    <td className="py-1.5 text-zinc-400">
                      {s.googleOfflineSentAt ? (
                        <span className="text-emerald-400">Enviado</span>
                      ) : s.googleOfflineError ? (
                        <span className="text-amber-200/80" title={s.googleOfflineError}>
                          Pendente / erro
                        </span>
                      ) : (
                        <span className="text-zinc-500">Na fila</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function FieldCopy({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase text-zinc-500">{label}</span>
      <div className="flex gap-2">
        <code className="flex-1 text-[11px] break-all rounded-lg bg-zinc-900 border border-zinc-800 p-2 text-zinc-300">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copyText(value)}
          className="shrink-0 p-2 rounded-lg bg-zinc-800 text-zinc-300"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function ConfigModal({ offer, onClose }: { offer: OfferRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 space-y-4">
        <h3 className="text-lg font-semibold">Postback — {offer.name}</h3>
        <p className="text-xs text-zinc-500">
          Cola o URL de postback na plataforma. O segredo só apareceu na criação; para HMAC usa o valor guardado no
          cofre.
        </p>
        <FieldCopy label="Postback URL" value={offer.postbackUrl || '(defina NEXT_PUBLIC_APP_URL)'} />
        <FieldCopy label="Checkout stealth (redirect)" value={offer.payUrl || '(defina NEXT_PUBLIC_APP_URL)'} />
        <p className="text-[11px] text-zinc-500">
          Click ID: <code className="text-zinc-400">{offer.clickIdField}</code> · Atraso offline:{' '}
          {offer.googleOfflineDelayMinutes} min
          {offer.referenceGrossBrl != null && (
            <>
              {' '}
              · Referência BRL: <code className="text-zinc-400">{offer.referenceGrossBrl}</code>
            </>
          )}
        </p>
        <button type="button" onClick={onClose} className="w-full py-2 rounded-lg bg-zinc-800 text-sm">
          Fechar
        </button>
      </div>
    </div>
  )
}

function EditModal({
  initial,
  canWrite,
  onClose,
  onSaved,
}: {
  initial: OfferRow | null
  canWrite: boolean
  onClose: () => void
  onSaved: (b: { postbackUrl: string | null; payUrl: string | null; webhookSecret: string; warning?: string } | null) => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [platform, setPlatform] = useState(initial?.platform || 'OTHER')
  const [checkoutTargetUrl, setCheckoutTargetUrl] = useState(initial?.checkoutTargetUrl || '')
  const [clickPreset, setClickPreset] = useState(
    CLICK_PRESETS.some((c) => c.value === initial?.clickIdField) ? initial!.clickIdField : 'custom'
  )
  const [clickCustom, setClickCustom] = useState(
    CLICK_PRESETS.some((c) => c.value === initial?.clickIdField) ? '' : initial?.clickIdField || 'auto'
  )
  const [delayMin, setDelayMin] = useState(String(initial?.googleOfflineDelayMinutes ?? 120))
  const [refGross, setRefGross] = useState(initial?.referenceGrossBrl ?? '')
  const [status, setStatus] = useState(initial?.status || 'ACTIVE')
  const [paySlug, setPaySlug] = useState(initial?.paySlug || '')
  const [saving, setSaving] = useState(false)

  const clickIdField = clickPreset === 'custom' ? clickCustom.trim() || 'auto' : clickPreset

  async function save() {
    if (!canWrite) return
    setSaving(true)
    try {
      if (!initial) {
        const r = await fetch('/api/admin/tracker-offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            platform,
            checkoutTargetUrl: checkoutTargetUrl.trim(),
            clickIdField,
            googleOfflineDelayMinutes: parseInt(delayMin, 10) || 120,
            status,
            referenceGrossBrl:
              refGross.trim() === '' ? null : (parseFloat(refGross.replace(',', '.')) || null),
          }),
        })
        const j = (await r.json()) as {
          id?: string
          postbackUrl?: string | null
          payUrl?: string | null
          webhookSecret?: string
          warning?: string
          error?: string
        }
        if (!r.ok) {
          alert(j.error || 'Erro ao criar')
          return
        }
        onSaved({
          postbackUrl: j.postbackUrl ?? null,
          payUrl: j.payUrl ?? null,
          webhookSecret: j.webhookSecret || '',
          warning: j.warning,
        })
        return
      }
      const r = await fetch(`/api/admin/tracker-offers/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          platform,
          checkoutTargetUrl: checkoutTargetUrl.trim(),
          clickIdField,
          googleOfflineDelayMinutes: parseInt(delayMin, 10) || 120,
          status,
          paySlug: paySlug.trim() || undefined,
          referenceGrossBrl:
            refGross.trim() === '' ? null : (parseFloat(refGross.replace(',', '.')) || null),
        }),
      })
      if (!r.ok) {
        const j = (await r.json()) as { error?: string }
        alert(j.error || 'Erro ao guardar')
        return
      }
      onSaved(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">{initial ? 'Editar oferta' : 'Nova oferta'}</h3>
        <label className="block text-sm space-y-1">
          <span className="text-zinc-400">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm space-y-1">
            <span className="text-zinc-400 text-xs">Plataforma</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white text-xs"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="text-zinc-400 text-xs">Estado</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white text-xs"
            >
              {STATUSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm space-y-1">
          <span className="text-zinc-400">URL real do checkout (gateway)</span>
          <input
            value={checkoutTargetUrl}
            onChange={(e) => setCheckoutTargetUrl(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
          />
        </label>
        <label className="block text-sm space-y-1">
          <span className="text-zinc-400 text-xs">Campo do click id (GCLID) no JSON</span>
          <select
            value={clickPreset}
            onChange={(e) => setClickPreset(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-white text-xs mb-2"
          >
            {CLICK_PRESETS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
            <option value="custom">Personalizado…</option>
          </select>
          {clickPreset === 'custom' && (
            <input
              value={clickCustom}
              onChange={(e) => setClickCustom(e.target.value)}
              placeholder="ex.: data.xcid"
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          )}
        </label>
        <label className="block text-sm space-y-1">
          <span className="text-zinc-400 text-xs">Atraso mínimo antes do envio offline Google (minutos)</span>
          <input
            value={delayMin}
            onChange={(e) => setDelayMin(e.target.value)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
          />
        </label>
        <label className="block text-sm space-y-1">
          <span className="text-zinc-400 text-xs">
            Valor bruto referência (BRL, opcional — alertas Módulo 10)
          </span>
          <input
            value={refGross}
            onChange={(e) => setRefGross(e.target.value)}
            placeholder="ex.: 197.00"
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
          />
        </label>
        {initial && (
          <label className="block text-sm space-y-1">
            <span className="text-zinc-400 text-xs">Slug /pay/… (opcional)</span>
            <input
              value={paySlug}
              onChange={(e) => setPaySlug(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white font-mono text-xs"
            />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !name.trim() || !checkoutTargetUrl.trim()}
            onClick={() => void save()}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white disabled:opacity-40"
          >
            {saving ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
