'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PushNotificationsSetup } from '@/components/PushNotificationsSetup'

type Config = {
  metaProducaoMensal: number
  metaVendasMensal: number
  bonusNivel1: number
  bonusNivel2: number
  bonusNivel3: number
  bonusNivelMax: number
  blackPagamentoPorConta24h: number
  producaoSalarioBase: number
  producaoMetaDiaria: number
  producaoMetaMensal: number
  producaoMetaElite: number
  producaoBonus200: number
  producaoBonus250: number
  producaoBonus300: number
  producaoBonus330: number
  producaoBonus600: number
  plugplaySalarioBase: number
  plugplayMetaDiaria: number
  plugplayMetaMensal: number
  plugplayMetaElite: number
  plugplayBonusBronze: number
  plugplayBonusPrata: number
  plugplayBonusOuro: number
  plugplayBonusMeta: number
  plugplayBonusElite: number
}

export default function AdminConfigPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Config>({
    metaProducaoMensal: 10000,
    metaVendasMensal: 10000,
    bonusNivel1: 200,
    bonusNivel2: 250,
    bonusNivel3: 300,
    bonusNivelMax: 330,
    blackPagamentoPorConta24h: 50,
    producaoSalarioBase: 1500,
    producaoMetaDiaria: 15,
    producaoMetaMensal: 330,
    producaoMetaElite: 600,
    producaoBonus200: 1000,
    producaoBonus250: 2000,
    producaoBonus300: 3000,
    producaoBonus330: 5000,
    producaoBonus600: 10000,
    plugplaySalarioBase: 2500,
    plugplayMetaDiaria: 15,
    plugplayMetaMensal: 330,
    plugplayMetaElite: 600,
    plugplayBonusBronze: 1000,
    plugplayBonusPrata: 2000,
    plugplayBonusOuro: 3000,
    plugplayBonusMeta: 5000,
    plugplayBonusElite: 10000,
  })

  useEffect(() => {
    fetch('/api/admin/config')
      .then((r) => r.json())
      .then((d) => {
        setConfig(d)
        setForm(d)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setConfig(data)
      } else {
        alert(data.error || 'Erro ao salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700 mb-4 inline-block">← Admin</Link>
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Configurações do Sistema</h1>
      </div>

      <div className="mb-8">
        <PushNotificationsSetup />
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <div className="card">
          <h2 className="font-semibold mb-4">Metas Mensais</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Meta de produção (contas/mês)</label>
              <input
                type="number"
                value={form.metaProducaoMensal}
                onChange={(e) => setForm((f) => ({ ...f, metaProducaoMensal: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meta de vendas (contas/mês)</label>
              <input
                type="number"
                value={form.metaVendasMensal}
                onChange={(e) => setForm((f) => ({ ...f, metaVendasMensal: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Níveis de Bônus Automático</h2>
          <p className="text-sm text-gray-500 mb-4">Produção mensal necessária para cada nível de bônus</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nível 1 (contas)</label>
              <input
                type="number"
                value={form.bonusNivel1}
                onChange={(e) => setForm((f) => ({ ...f, bonusNivel1: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nível 2 (contas)</label>
              <input
                type="number"
                value={form.bonusNivel2}
                onChange={(e) => setForm((f) => ({ ...f, bonusNivel2: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nível 3 (contas)</label>
              <input
                type="number"
                value={form.bonusNivel3}
                onChange={(e) => setForm((f) => ({ ...f, bonusNivel3: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nível máximo (contas)</label>
              <input
                type="number"
                value={form.bonusNivelMax}
                onChange={(e) => setForm((f) => ({ ...f, bonusNivelMax: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Produção – Time de Execução</h2>
          <p className="text-sm text-gray-500 mb-4">Meta padrão 330/mês, elite 600. Salário base R$ 1.500 + bônus por meta.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Salário base (R$/mês)</label>
              <input
                type="number"
                value={form.producaoSalarioBase}
                onChange={(e) => setForm((f) => ({ ...f, producaoSalarioBase: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meta diária</label>
              <input
                type="number"
                value={form.producaoMetaDiaria}
                onChange={(e) => setForm((f) => ({ ...f, producaoMetaDiaria: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meta mensal (oficial)</label>
              <input
                type="number"
                value={form.producaoMetaMensal}
                onChange={(e) => setForm((f) => ({ ...f, producaoMetaMensal: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meta elite (contas)</label>
              <input
                type="number"
                value={form.producaoMetaElite}
                onChange={(e) => setForm((f) => ({ ...f, producaoMetaElite: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus 200 contas (R$)</label>
              <input
                type="number"
                value={form.producaoBonus200}
                onChange={(e) => setForm((f) => ({ ...f, producaoBonus200: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus 250 contas (R$)</label>
              <input
                type="number"
                value={form.producaoBonus250}
                onChange={(e) => setForm((f) => ({ ...f, producaoBonus250: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus 300 contas (R$)</label>
              <input
                type="number"
                value={form.producaoBonus300}
                onChange={(e) => setForm((f) => ({ ...f, producaoBonus300: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus 330 contas (R$)</label>
              <input
                type="number"
                value={form.producaoBonus330}
                onChange={(e) => setForm((f) => ({ ...f, producaoBonus330: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus 600 elite (R$)</label>
              <input
                type="number"
                value={form.producaoBonus600}
                onChange={(e) => setForm((f) => ({ ...f, producaoBonus600: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Plug & Play Black</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Pagamento por conta que durou +24h (R$)</label>
            <input
              type="number"
              value={form.blackPagamentoPorConta24h}
              onChange={(e) => setForm((f) => ({ ...f, blackPagamentoPorConta24h: parseInt(e.target.value, 10) || 0 }))}
              className="input-field w-32"
            />
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </form>
    </div>
  )
}
