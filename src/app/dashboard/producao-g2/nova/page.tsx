'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NovaProducaoG2Page() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [clients, setClients] = useState<{ id: string; user: { name: string | null } }[]>([])
  const [deliveryGroups, setDeliveryGroups] = useState<{ id: string; groupNumber: string }[]>([])
  const [emailsReservados, setEmailsReservados] = useState<{ id: string; email: string }[]>([])
  const [cnpjsReservados, setCnpjsReservados] = useState<{ id: string; cnpj: string }[]>([])
  const [perfisReservados, setPerfisReservados] = useState<{ id: string; type: string; gateway: string }[]>([])
  const [form, setForm] = useState({
    taskName: '',
    currency: 'BRL' as 'BRL' | 'USD',
    estimatedDeliveryHours: '',
    clientId: '',
    deliveryType: '',
    deliveryGroupId: '',
    emailId: '',
    cnpjId: '',
    paymentProfileId: '',
    cnpjLink: '',
    siteUrl: '',
    googleAdsCustomerId: '',
    emailGoogle: '',
    passwordEncrypted: '',
    recoveryEmail: '',
    twoFaSecret: '',
    twoFaSms: '',
  })

  useEffect(() => {
    fetch('/api/clientes')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setClients(d.clients || d || []))
      .catch(() => {})
    fetch('/api/entregas-grupos?limit=100')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setDeliveryGroups(d.items || d || []))
      .catch(() => {})
    Promise.all([
      fetch('/api/estoque/itens?tipo=email&status=RESERVED').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/estoque/itens?tipo=cnpj&status=RESERVED').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/estoque/itens?tipo=perfil&status=RESERVED').then((r) => (r.ok ? r.json() : [])),
    ]).then(([e, c, p]) => {
      setEmailsReservados(Array.isArray(e) ? e : [])
      setCnpjsReservados(Array.isArray(c) ? c : [])
      setPerfisReservados(Array.isArray(p) ? p : [])
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const payload = {
      taskName: form.taskName,
      currency: form.currency,
      estimatedDeliveryHours: form.estimatedDeliveryHours ? parseInt(form.estimatedDeliveryHours, 10) : undefined,
      clientId: form.clientId || undefined,
      deliveryType: form.deliveryType || undefined,
      deliveryGroupId: form.deliveryGroupId || undefined,
      emailId: form.emailId || undefined,
      cnpjId: form.cnpjId || undefined,
      paymentProfileId: form.paymentProfileId || undefined,
      cnpjLink: form.cnpjLink || undefined,
      siteUrl: form.siteUrl || undefined,
      googleAdsCustomerId: form.googleAdsCustomerId || undefined,
      credentials:
        form.emailGoogle || form.passwordEncrypted || form.recoveryEmail || form.twoFaSecret || form.twoFaSms
          ? {
              emailGoogle: form.emailGoogle || undefined,
              passwordEncrypted: form.passwordEncrypted || undefined,
              recoveryEmail: form.recoveryEmail || undefined,
              twoFaSecret: form.twoFaSecret || undefined,
              twoFaSms: form.twoFaSms || undefined,
            }
          : undefined,
    }

    const res = await fetch('/api/production-g2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (res.ok) {
      router.push(`/dashboard/producao-g2/${data.id}`)
    } else {
      setError(data.error || 'Erro ao criar')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link href="/dashboard/producao-g2" className="text-primary-600 hover:underline text-sm mb-4 inline-block">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-ads-antracite mb-6">Nova Produção G2</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nome da tarefa *</label>
          <input
            type="text"
            required
            value={form.taskName}
            onChange={(e) => setForm({ ...form, taskName: e.target.value })}
            className="w-full rounded border-gray-300"
            placeholder="ex: Criar Entrega"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Moeda</label>
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value as 'BRL' | 'USD' })}
              className="w-full rounded border-gray-300"
            >
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tempo estimado (horas)</label>
            <input
              type="number"
              min="1"
              value={form.estimatedDeliveryHours}
              onChange={(e) => setForm({ ...form, estimatedDeliveryHours: e.target.value })}
              className="w-full rounded border-gray-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
            <select
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              className="w-full rounded border-gray-300"
            >
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.user?.name || c.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Grupo de entrega</label>
            <select
              value={form.deliveryGroupId}
              onChange={(e) => setForm({ ...form, deliveryGroupId: e.target.value })}
              className="w-full rounded border-gray-300"
            >
              <option value="">—</option>
              {deliveryGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.groupNumber}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-medium text-slate-700 mb-2">Base do estoque (opcional)</h3>
          <p className="text-xs text-slate-500 mb-3">Use itens reservados para você em Estoque</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email reservado</label>
              <select
                value={form.emailId}
                onChange={(e) => setForm({ ...form, emailId: e.target.value })}
                className="w-full rounded border-gray-300 text-sm"
              >
                <option value="">—</option>
                {emailsReservados.map((x) => (
                  <option key={x.id} value={x.id}>{x.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">CNPJ reservado</label>
              <select
                value={form.cnpjId}
                onChange={(e) => setForm({ ...form, cnpjId: e.target.value })}
                className="w-full rounded border-gray-300 text-sm"
              >
                <option value="">—</option>
                {cnpjsReservados.map((x) => (
                  <option key={x.id} value={x.id}>{x.cnpj}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Perfil reservado</label>
              <select
                value={form.paymentProfileId}
                onChange={(e) => setForm({ ...form, paymentProfileId: e.target.value })}
                className="w-full rounded border-gray-300 text-sm"
              >
                <option value="">—</option>
                {perfisReservados.map((x) => (
                  <option key={x.id} value={x.id}>{x.type} / {x.gateway}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Link CNPJ</label>
          <input
            type="url"
            value={form.cnpjLink}
            onChange={(e) => setForm({ ...form, cnpjLink: e.target.value })}
            className="w-full rounded border-gray-300"
            placeholder="URL do CNPJ (número extraído automaticamente)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Site vinculado</label>
          <input
            type="url"
            value={form.siteUrl}
            onChange={(e) => setForm({ ...form, siteUrl: e.target.value })}
            className="w-full rounded border-gray-300"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">ID Conta Google Ads</label>
          <input
            type="text"
            value={form.googleAdsCustomerId}
            onChange={(e) => setForm({ ...form, googleAdsCustomerId: e.target.value })}
            className="w-full rounded border-gray-300"
            placeholder="123-456-7890"
          />
        </div>

        <div className="border-t pt-4 mt-4">
          <h3 className="font-medium text-slate-700 mb-3">Credenciais (opcional)</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email Google</label>
              <input
                type="email"
                value={form.emailGoogle}
                onChange={(e) => setForm({ ...form, emailGoogle: e.target.value })}
                className="w-full rounded border-gray-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Senha</label>
              <input
                type="password"
                value={form.passwordEncrypted}
                onChange={(e) => setForm({ ...form, passwordEncrypted: e.target.value })}
                className="w-full rounded border-gray-300 text-sm"
                placeholder="Armazenada de forma segura"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email de recuperação</label>
              <input
                type="email"
                value={form.recoveryEmail}
                onChange={(e) => setForm({ ...form, recoveryEmail: e.target.value })}
                className="w-full rounded border-gray-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">2FA Secret / SMS</label>
              <input
                type="text"
                value={form.twoFaSecret}
                onChange={(e) => setForm({ ...form, twoFaSecret: e.target.value })}
                className="w-full rounded border-gray-300 text-sm"
                placeholder="Código Authenticator ou SMS"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Criando...' : 'Criar Produção G2'}
          </button>
          <Link href="/dashboard/producao-g2" className="btn-secondary">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
