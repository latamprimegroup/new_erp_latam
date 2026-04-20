'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

async function fetchJson(url: string) {
  const res = await fetch(url)
  const j = (await res.json()) as Record<string, unknown> & { error?: string }
  if (!res.ok) throw new Error(j.error || 'Erro ao carregar')
  return j
}

type WarRoomPayload = {
  client: Record<string, unknown> & {
    user: { name: string | null; email: string }
    clientCode?: string | null
    clientStatus?: string
    operationNiche?: string | null
    whatsapp?: string | null
    accountManager?: { id: string } | null
  }
  header: {
    ltvApprox: number
    avgTicketApprox: number
    accountsInWarrantyApprox: number
    lastCurrency: string
  }
  orders: Array<{
    id: string
    createdAt: string
    product: string
    value: number
    currency: string
    warrantyUiStatus: string
    deliveryMethod: string | null
    sellerName: string | null
  }>
  technicalNotes: Array<{ id: string; body: string; createdAt: string; authorName: string }>
}

const WARRANTY_LABEL: Record<string, string> = {
  SEM_PAGAMENTO: '—',
  VIGENTE: 'Vigente',
  EXPIRADA: 'Expirada',
  REIVINDICADA: 'Reivindicada',
}

const NICHE_OPTS = ['', 'BLACK', 'WHITE', 'HEALTH', 'IGAMING', 'NUTRA', 'CRYPTO', 'OUTRO']
const PAY_PREF = ['', 'BANK_TRANSFER', 'STRIPE', 'CRYPTO', 'LEAD_BANK', 'PIX', 'OUTRO']
const LEAD_SRC = ['', 'INDICACAO', 'TRÁFEGO_PAGO', 'ORGANICO', 'OUTRO']

function waMeUrl(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const n = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${n}`
}

export function WarRoomClienteClient({ clientId }: { clientId: string }) {
  const [data, setData] = useState<WarRoomPayload | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'cadastro' | 'operacao' | 'pedidos' | 'notas'>('cadastro')
  const [noteDraft, setNoteDraft] = useState('')
  const [form, setForm] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setErr('')
    try {
      const j = (await fetchJson(`/api/commercial/war-room-client/${clientId}`)) as WarRoomPayload
      setData(j)
      const c = j.client as WarRoomPayload['client'] & Record<string, string | null | undefined>
      setForm({
        taxId: c.taxId || '',
        companyName: c.companyName || '',
        jobTitle: c.jobTitle || '',
        telegramUsername: c.telegramUsername || '',
        timezone: c.timezone || '',
        adsPowerEmail: c.adsPowerEmail || '',
        operationNiche: c.operationNiche || '',
        trustLevelStars: c.trustLevelStars != null ? String(c.trustLevelStars) : '',
        preferredCurrency: c.preferredCurrency || 'BRL',
        preferredPaymentMethod: c.preferredPaymentMethod || '',
        clientStatus: c.clientStatus || 'ATIVO',
        leadAcquisitionSource: c.leadAcquisitionSource || '',
        commercialNotes: c.commercialNotes || '',
        technicalSupportNotes: c.technicalSupportNotes || '',
        accountManagerId: c.accountManager?.id || '',
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Falha ao carregar')
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  async function savePatch(partial: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/commercial/crm/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error || 'Erro ao salvar')
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    const trust = form.trustLevelStars ? parseInt(form.trustLevelStars, 10) : null
    await savePatch({
      taxId: form.taxId || null,
      companyName: form.companyName || null,
      jobTitle: form.jobTitle || null,
      telegramUsername: form.telegramUsername || null,
      timezone: form.timezone || null,
      adsPowerEmail: form.adsPowerEmail || null,
      operationNiche: form.operationNiche || null,
      trustLevelStars: trust && trust >= 1 && trust <= 5 ? trust : null,
      preferredCurrency: form.preferredCurrency,
      preferredPaymentMethod: form.preferredPaymentMethod || null,
      clientStatus: form.clientStatus || 'ATIVO',
      leadAcquisitionSource: form.leadAcquisitionSource || null,
      commercialNotes: form.commercialNotes || null,
      technicalSupportNotes: form.technicalSupportNotes || null,
      accountManagerId: form.accountManagerId?.trim() || null,
    })
  }

  async function addTechnicalNote() {
    const t = noteDraft.trim()
    if (!t) return
    setSaving(true)
    try {
      const res = await fetch(`/api/commercial/clients/${clientId}/technical-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: t }),
      })
      if (!res.ok) {
        const j = await res.json()
        alert(j.error || 'Erro')
        return
      }
      setNoteDraft('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (err && !data) {
    return (
      <div className="p-6">
        <p className="text-red-600">{err}</p>
        <Link href="/dashboard/vendas" className="text-primary-600 mt-4 inline-block">
          Voltar às vendas
        </Link>
      </div>
    )
  }
  if (!data) {
    return <p className="p-6 text-gray-500">Carregando ficha…</p>
  }

  const { client, header, orders, technicalNotes } = data
  const sym = header.lastCurrency === 'USD' ? 'US$' : 'R$'
  const whatsappHref = waMeUrl(client.whatsapp)

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Link
            href="/dashboard/vendas"
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            ← Vendas
          </Link>
          <h1 className="heading-1 mt-1">War Room OS — Cliente</h1>
        </div>
      </div>

      <header className="rounded-xl border border-gray-200 dark:border-white/10 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 md:p-5 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Cliente</p>
            <p className="text-xl font-semibold">
              {client.user.name || client.user.email}
              {client.clientCode && (
                <span className="ml-2 font-mono text-sm text-amber-300">{client.clientCode}</span>
              )}
            </p>
            <p className="text-sm text-slate-300 mt-1">
              Status: <strong>{String(client.clientStatus ?? '—')}</strong>
              {client.operationNiche ? (
                <>
                  {' '}
                  · Nicho: <strong>{String(client.operationNiche)}</strong>
                </>
              ) : null}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-slate-400 text-xs">LTV (pedidos entregues)</p>
              <p className="font-mono font-semibold text-lg">
                {sym} {header.ltvApprox.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Ticket médio (aprox.)</p>
              <p className="font-mono">
                {sym} {header.avgTicketApprox.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Garantias ativas (aprox.)</p>
              <p className="font-mono text-amber-200">{header.accountsInWarrantyApprox}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={whatsappHref ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-100 ${
              whatsappHref ? 'hover:bg-emerald-900/50' : 'opacity-40 pointer-events-none'
            }`}
          >
            WhatsApp
          </a>
          <a
            href={client.adsPowerEmail ? `mailto:${client.adsPowerEmail}` : undefined}
            className={`text-xs px-3 py-1.5 rounded-lg border border-white/20 ${
              client.adsPowerEmail ? 'hover:bg-white/10' : 'opacity-40 pointer-events-none'
            }`}
          >
            E-mail AdsPower
          </a>
          <Link
            href="/dashboard/commercial"
            className="text-xs px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10"
          >
            Oxigênio comercial
          </Link>
          <span className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-white/25 text-slate-400">
            Transferência AdsPower / Lead Bank — use processo interno (links externos)
          </span>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-white/10 pb-2">
        {(
          [
            ['cadastro', 'Cadastro'],
            ['operacao', 'Operação & contingência'],
            ['pedidos', 'Pedidos & garantia'],
            ['notas', 'Notas técnicas (histórico)'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              tab === k
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'cadastro' && (
        <form onSubmit={submitForm} className="grid md:grid-cols-2 gap-4 card p-4">
          <div className="md:col-span-2 text-sm font-medium text-primary-600">Dados cadastrais</div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Empresa / razão</label>
            <input
              className="input-field w-full"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">CNPJ / Tax ID / EIN</label>
            <input
              className="input-field w-full font-mono"
              value={form.taxId}
              onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cargo</label>
            <input
              className="input-field w-full"
              value={form.jobTitle}
              onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Telegram @</label>
            <input
              className="input-field w-full"
              value={form.telegramUsername}
              onChange={(e) => setForm((f) => ({ ...f, telegramUsername: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">País / fuso (texto)</label>
            <input
              className="input-field w-full"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              placeholder="America/Sao_Paulo"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">WhatsApp (perfil)</label>
            <p className="text-sm font-mono">{client.whatsapp || '—'}</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Notas comerciais</label>
            <textarea
              className="input-field w-full min-h-[80px]"
              value={form.commercialNotes}
              onChange={(e) => setForm((f) => ({ ...f, commercialNotes: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar cadastro'}
            </button>
          </div>
        </form>
      )}

      {tab === 'operacao' && (
        <form onSubmit={submitForm} className="grid md:grid-cols-2 gap-4 card p-4">
          <div className="md:col-span-2 text-sm font-medium text-primary-600">Operação & contingência</div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">E-mail AdsPower (destaque)</label>
            <input
              className="input-field w-full border-2 border-amber-500/40"
              value={form.adsPowerEmail}
              onChange={(e) => setForm((f) => ({ ...f, adsPowerEmail: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nicho principal</label>
            <select
              className="input-field w-full"
              value={form.operationNiche}
              onChange={(e) => setForm((f) => ({ ...f, operationNiche: e.target.value }))}
            >
              {NICHE_OPTS.map((n) => (
                <option key={n} value={n}>
                  {n || '—'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Confiança (1–5)</label>
            <select
              className="input-field w-full"
              value={form.trustLevelStars}
              onChange={(e) => setForm((f) => ({ ...f, trustLevelStars: e.target.value }))}
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n} estrela(s)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Moeda padrão</label>
            <select
              className="input-field w-full"
              value={form.preferredCurrency}
              onChange={(e) => setForm((f) => ({ ...f, preferredCurrency: e.target.value }))}
            >
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Pagamento preferido</label>
            <select
              className="input-field w-full"
              value={form.preferredPaymentMethod}
              onChange={(e) => setForm((f) => ({ ...f, preferredPaymentMethod: e.target.value }))}
            >
              {PAY_PREF.map((p) => (
                <option key={p} value={p}>
                  {p || '—'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Origem do lead</label>
            <select
              className="input-field w-full"
              value={form.leadAcquisitionSource}
              onChange={(e) => setForm((f) => ({ ...f, leadAcquisitionSource: e.target.value }))}
            >
              {LEAD_SRC.map((p) => (
                <option key={p} value={p}>
                  {p || '—'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status cliente</label>
            <input
              className="input-field w-full"
              value={form.clientStatus}
              onChange={(e) => setForm((f) => ({ ...f, clientStatus: e.target.value }))}
              placeholder="ATIVO, VIP…"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ID gestor da conta (User)</label>
            <input
              className="input-field w-full font-mono text-xs"
              value={form.accountManagerId}
              onChange={(e) => setForm((f) => ({ ...f, accountManagerId: e.target.value }))}
              placeholder="cuid do usuário interno"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">
              Observações técnicas (campo legado — use aba Notas para histórico)
            </label>
            <textarea
              className="input-field w-full min-h-[100px]"
              value={form.technicalSupportNotes}
              onChange={(e) => setForm((f) => ({ ...f, technicalSupportNotes: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar operação'}
            </button>
          </div>
        </form>
      )}

      {tab === 'pedidos' && (
        <div className="card p-4 overflow-x-auto">
          <h3 className="font-semibold mb-3">Histórico de compras (War Room)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-2">Data</th>
                <th className="pb-2 pr-2">Produto</th>
                <th className="pb-2 pr-2">Valor</th>
                <th className="pb-2 pr-2">Garantia</th>
                <th className="pb-2 pr-2">Entrega</th>
                <th className="pb-2">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: { id: string; createdAt: string; product: string; value: number; currency: string; warrantyUiStatus: string; deliveryMethod: string | null; sellerName: string | null }) => (
                <tr key={o.id} className="border-b border-gray-100 dark:border-white/5">
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-2 pr-2">{o.product}</td>
                  <td className="py-2 pr-2 font-mono">
                    {o.currency === 'USD' ? 'US$' : 'R$'}{' '}
                    {o.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 pr-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        o.warrantyUiStatus === 'VIGENTE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : o.warrantyUiStatus === 'REIVINDICADA'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {WARRANTY_LABEL[o.warrantyUiStatus] || o.warrantyUiStatus}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-xs">{o.deliveryMethod || '—'}</td>
                  <td className="py-2 text-xs">{o.sellerName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="text-gray-500 text-sm py-4">Nenhum pedido.</p>}
        </div>
      )}

      {tab === 'notas' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold mb-2">Nova entrada (append-only)</h3>
            <textarea
              className="input-field w-full min-h-[100px]"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Proxy X cai com BM Y, cliente repete erro Z…"
            />
            <button
              type="button"
              className="btn-primary mt-2"
              disabled={saving}
              onClick={() => void addTechnicalNote()}
            >
              Registrar nota
            </button>
          </div>
          <ul className="space-y-2">
            {technicalNotes.map(
              (n: { id: string; body: string; createdAt: string; authorName: string }) => (
                <li
                  key={n.id}
                  className="card p-3 text-sm border-l-4 border-primary-500/50"
                >
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{n.authorName}</span>
                    <span>{new Date(n.createdAt).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">{n.body}</p>
                </li>
              )
            )}
          </ul>
          {technicalNotes.length === 0 && (
            <p className="text-gray-500 text-sm">Nenhuma nota técnica ainda.</p>
          )}
        </div>
      )}
    </div>
  )
}
