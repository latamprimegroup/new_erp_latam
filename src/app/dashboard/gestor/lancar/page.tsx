'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PLATFORMS = [
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'KWAI_ADS', label: 'Kwai Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
  { value: 'OTHER', label: 'Outro' },
]

export default function LancarContaPage() {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    platform: 'GOOGLE_ADS',
    type: '',
    yearStarted: new Date().getFullYear(),
    niche: '',
    minConsumed: 0,
    purchasePrice: 0,
    markupPercent: 20,
    supplierId: '',
    description: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/fornecedores').then((r) => r.json()).then(setSuppliers).catch(() => {})
  }, [])

  const salePrice = form.purchasePrice * (1 + form.markupPercent / 100)
  const margin = form.purchasePrice > 0
    ? ((salePrice - form.purchasePrice) / form.purchasePrice * 100).toFixed(1)
    : '0'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const res = await fetch('/api/gestor/contas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        yearStarted: form.yearStarted || undefined,
        minConsumed: form.minConsumed || undefined,
        purchasePrice: form.purchasePrice || undefined,
        markupPercent: form.markupPercent || undefined,
        supplierId: form.supplierId || undefined,
      }),
    })
    if (res.ok) {
      router.push('/dashboard/gestor/contas')
    } else {
      const data = await res.json()
      setError(data.error || 'Erro ao cadastrar')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/gestor" className="text-gray-500 hover:text-gray-700">
          ← Voltar
        </Link>
        <h1 className="heading-1">
          Lançar Nova Conta
        </h1>
      </div>

      <div className="card max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm">{error}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo de conta *</label>
              <select
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                className="input-field"
                required
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tipo/Modelo *</label>
              <input
                type="text"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="input-field"
                placeholder="Ads USD"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ano de início</label>
              <input
                type="number"
                value={form.yearStarted}
                onChange={(e) => setForm((f) => ({ ...f, yearStarted: parseInt(e.target.value) || 0 }))}
                className="input-field"
                placeholder="2020"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nicho</label>
              <input
                type="text"
                value={form.niche}
                onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
                className="input-field"
                placeholder="Saúde, E-commerce..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Mínimo consumido (R$)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.minConsumed || ''}
                onChange={(e) => setForm((f) => ({ ...f, minConsumed: parseFloat(e.target.value) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preço de compra (R$)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.purchasePrice || ''}
                onChange={(e) => setForm((f) => ({ ...f, purchasePrice: parseFloat(e.target.value) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fornecedor</label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                className="input-field"
              >
                <option value="">Nenhum</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Markup (%)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.markupPercent}
                onChange={(e) => setForm((f) => ({ ...f, markupPercent: parseFloat(e.target.value) || 0 }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg border border-primary-600/5">
            <p className="text-sm text-gray-600">
              <strong>Preço de venda calculado:</strong> R$ {salePrice.toLocaleString('pt-BR')}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>Margem de lucro:</strong> {margin}%
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="input-field min-h-[80px]"
              placeholder="Detalhes da conta..."
            />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Salvando...' : 'Salvar Conta'}
            </button>
            <Link href="/dashboard/gestor/contas" className="btn-secondary">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
