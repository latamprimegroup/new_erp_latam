'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Copy, Link2, RefreshCw, Send } from 'lucide-react'

type OfferOpt = { id: string; name: string; platform: string; paySlug: string; postbackUrl: string | null }

type SettingsPayload = {
  forwardedParamKeys: string[]
  paramMode: 'ALLOWLIST_ONLY' | 'PRESERVE_ALL_INBOUND'
  useEphemeralLinks: boolean
  ephemeralTtlMinutes: number
  ephemeralMaxUses: number
  pixelBackupDelayMs: number | null
}

type InitRow = {
  id: string
  offerId: string | null
  offerName: string | null
  sourceIp: string
  fromGoogleAds: boolean
  outcome: string
  viaEphemeralToken: boolean
  paySlugOrToken: string | null
  createdAt: string
}

const SUGGESTED_KEYS = [
  'gclid',
  'utm_source',
  'utm_campaign',
  'click_id',
  'utm_medium',
  'utm_content',
  'utm_term',
  'gbraid',
  'wbraid',
  'msclkid',
]

async function copyText(text: string) {
  await navigator.clipboard.writeText(text).catch(() => {})
}

export function CheckoutSettingsClient({ canWrite }: { canWrite: boolean }) {
  const [offers, setOffers] = useState<OfferOpt[]>([])
  const [offerId, setOfferId] = useState<string>('')
  const [settings, setSettings] = useState<SettingsPayload | null>(null)
  const [persisted, setPersisted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [snippet, setSnippet] = useState<string>('')
  const [inits, setInits] = useState<InitRow[]>([])
  const [ephemeralUrl, setEphemeralUrl] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  const loadOffers = useCallback(() => {
    fetch('/api/admin/tracker-offers')
      .then((r) => r.json() as Promise<{ offers: OfferOpt[] }>)
      .then((j) => setOffers(j.offers || []))
      .catch(() => setErr('Falha ao carregar ofertas'))
  }, [])

  useEffect(() => {
    if (!offerId && offers.length > 0) {
      setOfferId(offers[0].id)
    }
  }, [offers, offerId])

  const loadSettings = useCallback(() => {
    if (!offerId) return
    setLoading(true)
    setErr(null)
    fetch(`/api/admin/tracker-checkout/settings?offerId=${encodeURIComponent(offerId)}`)
      .then((r) => {
        if (!r.ok) throw new Error('st')
        return r.json() as Promise<{ persisted: boolean; settings: SettingsPayload }>
      })
      .then((j) => {
        setPersisted(j.persisted)
        setSettings(j.settings)
      })
      .catch(() => setErr('Falha ao carregar definições.'))
      .finally(() => setLoading(false))
  }, [offerId])

  const loadSnippet = useCallback(() => {
    if (!offerId) return
    fetch(`/api/admin/tracker-offers/${offerId}/checkout-snippet`)
      .then((r) => {
        if (!r.ok) throw new Error('snip')
        return r.text()
      })
      .then(setSnippet)
      .catch(() => setSnippet(''))
  }, [offerId])

  const loadInits = useCallback(() => {
    const q = offerId ? `?offerId=${encodeURIComponent(offerId)}&take=80` : '?take=80'
    fetch(`/api/admin/tracker-checkout/initiations${q}`)
      .then((r) => r.json() as Promise<{ initiations: InitRow[] }>)
      .then((j) => setInits(j.initiations || []))
      .catch(() => setInits([]))
  }, [offerId])

  useEffect(() => {
    loadOffers()
  }, [loadOffers])

  useEffect(() => {
    loadSettings()
    loadSnippet()
    loadInits()
  }, [offerId, loadSettings, loadSnippet, loadInits])

  function toggleKey(k: string) {
    if (!settings || !canWrite) return
    const has = settings.forwardedParamKeys.includes(k)
    const next = has
      ? settings.forwardedParamKeys.filter((x) => x !== k)
      : [...settings.forwardedParamKeys, k]
    setSettings({ ...settings, forwardedParamKeys: next.length ? next : ['gclid'] })
  }

  async function save() {
    if (!canWrite || !offerId || !settings) return
    setSaving(true)
    setErr(null)
    try {
      const r = await fetch('/api/admin/tracker-checkout/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId, ...settings }),
      })
      if (!r.ok) throw new Error('save')
      setPersisted(true)
      loadSnippet()
    } catch {
      setErr('Não foi possível guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function genEphemeral() {
    if (!canWrite || !offerId) return
    setEphemeralUrl(null)
    const r = await fetch('/api/admin/tracker-checkout/ephemeral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerId }),
    })
    const j = (await r.json()) as { url?: string; error?: string }
    if (!r.ok) setErr(j.error || 'Token efémero falhou')
    else if (j.url) {
      setEphemeralUrl(j.url)
      void copyText(j.url)
    }
  }

  async function testPostback() {
    if (!canWrite || !offerId) return
    setTestResult(null)
    const r = await fetch(`/api/admin/tracker-offers/${offerId}/test-postback`, { method: 'POST' })
    const j = (await r.json()) as { ok?: boolean; httpStatus?: number; responsePreview?: string; error?: string }
    if (!r.ok) setTestResult(j.error || 'Falha')
    else
      setTestResult(
        `HTTP ${j.httpStatus} · ok=${j.ok}\n${j.responsePreview || ''}`
      )
  }

  const selectedOffer = offers.find((o) => o.id === offerId)

  return (
    <div className="space-y-6">
      {offers.length === 0 && (
        <p className="text-sm text-amber-200/90">
          Cria primeiro uma oferta no Módulo 05 para configurar o checkout.
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-zinc-400">
            Oferta
            <select
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              disabled={offers.length === 0}
              className="ml-2 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.platform})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              loadSettings()
              loadSnippet()
              loadInits()
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recarregar
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-xs text-amber-100/90 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-200">Iframe / mirror de checkout</p>
            <p className="text-amber-100/80 mt-1">
              Não suportado neste ERP: muitos gateways proíbem <code className="text-amber-200/90">iframe</code> do
              checkout, e embutir pagamentos para “enganar” revisão viola políticas. Usa apenas redirecionamento HTTP no
              servidor (<code className="text-amber-200/90">/pay/…</code>).
            </p>
          </div>
        </div>
      </div>

      {settings && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-200">Mapeamento de parâmetros (UTM / click id)</h2>
          <p className="text-[11px] text-zinc-500">
            Modo allowlist: só as chaves marcadas são copiadas para o URL do gateway. Modo preservar tudo: todos os
            query params do pedido a <code className="text-zinc-400">/pay/…</code> são repassados se o gateway ainda não
            os tiver.
            {!persisted && ' · Definições ainda não gravadas na base (valores por omissão).'}
          </p>

          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                checked={settings.paramMode === 'ALLOWLIST_ONLY'}
                disabled={!canWrite}
                onChange={() => setSettings({ ...settings, paramMode: 'ALLOWLIST_ONLY' })}
              />
              Allowlist (recomendado)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                checked={settings.paramMode === 'PRESERVE_ALL_INBOUND'}
                disabled={!canWrite}
                onChange={() => setSettings({ ...settings, paramMode: 'PRESERVE_ALL_INBOUND' })}
              />
              Preservar todos os params do pedido
            </label>
          </div>

          {settings.paramMode === 'ALLOWLIST_ONLY' && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_KEYS.map((k) => (
                <label
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[11px] text-zinc-300"
                >
                  <input
                    type="checkbox"
                    disabled={!canWrite}
                    checked={settings.forwardedParamKeys.includes(k)}
                    onChange={() => toggleKey(k)}
                  />
                  {k}
                </label>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-zinc-400">TTL token efémero (min)</span>
              <input
                type="number"
                disabled={!canWrite}
                value={settings.ephemeralTtlMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, ephemeralTtlMinutes: parseInt(e.target.value, 10) || 60 })
                }
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-zinc-400">Máx. usos por token</span>
              <input
                type="number"
                disabled={!canWrite}
                value={settings.ephemeralMaxUses}
                onChange={(e) =>
                  setSettings({ ...settings, ephemeralMaxUses: parseInt(e.target.value, 10) || 1 })
                }
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-white"
              />
            </label>
            <label className="flex items-center gap-2 col-span-full">
              <input
                type="checkbox"
                disabled={!canWrite}
                checked={settings.useEphemeralLinks}
                onChange={(e) => setSettings({ ...settings, useEphemeralLinks: e.target.checked })}
              />
              <span className="text-zinc-300">Destacar uso de links dinâmicos (geração manual abaixo)</span>
            </label>
            <label className="space-y-1 col-span-full">
              <span className="text-zinc-400">Atraso sugerido para pixel/script de backup (ms, opcional)</span>
              <input
                type="number"
                disabled={!canWrite}
                placeholder="ex.: 2500"
                value={settings.pixelBackupDelayMs ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setSettings({
                    ...settings,
                    pixelBackupDelayMs: v === '' ? null : parseInt(v, 10) || 0,
                  })
                }}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-white"
              />
              <span className="text-[10px] text-zinc-600 block">
                Aparece como comentário no snippet; aplica no teu tema em conformidade com políticas — não é evasão de
                revisão.
              </span>
            </label>
          </div>

          {canWrite && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-primary-600 text-white text-sm px-4 py-2 disabled:opacity-40"
            >
              {saving ? 'A guardar…' : 'Guardar definições'}
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">Script “Append parameters”</h2>
        <p className="text-[11px] text-zinc-500">
          Cola antes de <code className="text-zinc-400">&lt;/body&gt;</code>. Links com{' '}
          <code className="text-zinc-400">data-ads-checkout-tunnel</code> recebem os parâmetros da página atual. Ex.:{' '}
          <code className="text-zinc-400">&lt;a href=&quot;…/pay/slug&quot; data-ads-checkout-tunnel&gt;Comprar&lt;/a&gt;</code>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void copyText(snippet)}
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs"
          >
            <Copy className="w-3.5 h-3.5" />
            Copiar JS
          </button>
        </div>
        <pre className="text-[10px] text-zinc-400 overflow-x-auto max-h-48 rounded-lg bg-zinc-900 p-3 border border-zinc-800">
          {snippet || '—'}
        </pre>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">Webhooks por plataforma</h2>
        <p className="text-[11px] text-zinc-500">
          Kiwify, Hotmart, Perfect Pay e outras usam o mesmo endpoint S2S gerado na oferta (Módulo 05). Cola o URL de
          postback nas definições da plataforma.
        </p>
        {selectedOffer?.postbackUrl && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <code className="text-zinc-400 break-all flex-1 min-w-0">{selectedOffer.postbackUrl}</code>
            <button
              type="button"
              onClick={() => void copyText(selectedOffer.postbackUrl!)}
              className="shrink-0 rounded-lg bg-zinc-800 px-2 py-1"
            >
              Copiar
            </button>
          </div>
        )}
        {!selectedOffer?.postbackUrl && (
          <p className="text-xs text-amber-200/80">Define NEXT_PUBLIC_APP_URL para ver o URL completo.</p>
        )}
        {canWrite && (
          <button
            type="button"
            onClick={() => void testPostback()}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs"
          >
            <Send className="w-3.5 h-3.5" />
            Testar conexão (postback simulado)
          </button>
        )}
        {testResult && (
          <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap border border-zinc-800 rounded-lg p-2">
            {testResult}
          </pre>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">Link dinâmico (/pay/t/…)</h2>
        <p className="text-[11px] text-zinc-500">
          Gera um token com TTL e limite de usos (ajustáveis acima). Útil para reduzir mapeamento em massa por
          ferramentas externas — não substitui segurança nem políticas de anúncio.
        </p>
        {canWrite && (
          <button
            type="button"
            onClick={() => void genEphemeral()}
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs"
          >
            <Link2 className="w-3.5 h-3.5" />
            Gerar link efémero
          </button>
        )}
        {ephemeralUrl && (
          <p className="text-xs text-emerald-300/90 break-all">Copiado / gerado: {ephemeralUrl}</p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-zinc-200">Abandono de carrinho (S2S)</h2>
        <p className="text-[11px] text-zinc-500">
          Registar e-mail sem compra depende de evento enviado pelo gateway (webhook próprio ou API). Quando a
          plataforma expuser esse sinal, podes encaminhá-lo para o mesmo postback com{' '}
          <code className="text-zinc-400">status</code> diferenciado — extensão futura no modelo de sinais.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-2">Iniciações de checkout</h2>
        <p className="text-[11px] text-zinc-500 mb-3">
          Pedidos ao <code className="text-zinc-400">/pay/…</code> ou <code className="text-zinc-400">/pay/t/…</code>.
          Origem Google Ads = presença de gclid/gbraid/wbraid/msclkid no querystring.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left py-2">Quando</th>
                <th className="text-left py-2">IP</th>
                <th className="text-left py-2">Oferta</th>
                <th className="text-center py-2">Google Ads?</th>
                <th className="text-left py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {inits.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 text-zinc-400 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-1.5 font-mono text-zinc-500">{r.sourceIp}</td>
                  <td className="py-1.5 text-zinc-300 max-w-[140px] truncate" title={r.offerName || ''}>
                    {r.offerName || '—'}
                  </td>
                  <td className="py-1.5 text-center">{r.fromGoogleAds ? 'sim' : 'não'}</td>
                  <td className="py-1.5 text-zinc-400">
                    {r.outcome}
                    {r.viaEphemeralToken ? ' · token' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
