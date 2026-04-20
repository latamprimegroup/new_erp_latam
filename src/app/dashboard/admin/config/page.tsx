'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PushNotificationsSetup } from '@/components/PushNotificationsSetup'

type Config = {
  joinchatId?: string
  whatsappNumber?: string
  widgetNiche?: string
  footerCustomScripts?: string
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
  const [saveOk, setSaveOk] = useState(false)
  const [form, setForm] = useState<Config>({
    joinchatId: '',
    whatsappNumber: '',
    widgetNiche: '',
    footerCustomScripts: '',
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
    Promise.all([
      fetch('/api/admin/config').then((r) => r.json()),
      fetch('/api/admin/config/widgets').then((r) => r.json()).catch(() => ({ joinchatId: '', whatsappNumber: '' })),
    ]).then(([configData, widgetsData]) => {
      const merged = {
        ...configData,
        joinchatId: widgetsData.joinchatId ?? '',
        whatsappNumber: widgetsData.whatsappNumber ?? '',
        widgetNiche: widgetsData.widgetNiche ?? '',
        footerCustomScripts: widgetsData.footerCustomScripts ?? '',
      }
      setConfig(merged)
      setForm(merged)
    }).finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveOk(false)
    try {
      const [configRes, widgetsRes] = await Promise.all([
        fetch('/api/admin/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metaProducaoMensal: form.metaProducaoMensal,
            metaVendasMensal: form.metaVendasMensal,
            bonusNivel1: form.bonusNivel1,
            bonusNivel2: form.bonusNivel2,
            bonusNivel3: form.bonusNivel3,
            bonusNivelMax: form.bonusNivelMax,
            blackPagamentoPorConta24h: form.blackPagamentoPorConta24h,
            producaoSalarioBase: form.producaoSalarioBase,
            producaoMetaDiaria: form.producaoMetaDiaria,
            producaoMetaMensal: form.producaoMetaMensal,
            producaoMetaElite: form.producaoMetaElite,
            producaoBonus200: form.producaoBonus200,
            producaoBonus250: form.producaoBonus250,
            producaoBonus300: form.producaoBonus300,
            producaoBonus330: form.producaoBonus330,
            producaoBonus600: form.producaoBonus600,
            plugplaySalarioBase: form.plugplaySalarioBase,
            plugplayMetaDiaria: form.plugplayMetaDiaria,
            plugplayMetaMensal: form.plugplayMetaMensal,
            plugplayMetaElite: form.plugplayMetaElite,
            plugplayBonusBronze: form.plugplayBonusBronze,
            plugplayBonusPrata: form.plugplayBonusPrata,
            plugplayBonusOuro: form.plugplayBonusOuro,
            plugplayBonusMeta: form.plugplayBonusMeta,
            plugplayBonusElite: form.plugplayBonusElite,
          }),
        }),
        fetch('/api/admin/config/widgets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            joinchatId: form.joinchatId ?? '',
            whatsappNumber: form.whatsappNumber ?? '',
            widgetNiche: form.widgetNiche ?? '',
            footerCustomScripts: form.footerCustomScripts ?? '',
          }),
        }),
      ])
      const configData = await configRes.json()
      const widgetsData = await widgetsRes.json()
      if (configRes.ok) {
        setSaveOk(true)
        setTimeout(() => setSaveOk(false), 5000)
        setConfig({
          ...configData,
          joinchatId: widgetsData.joinchatId ?? '',
          whatsappNumber: widgetsData.whatsappNumber ?? '',
          widgetNiche: widgetsData.widgetNiche ?? '',
          footerCustomScripts: widgetsData.footerCustomScripts ?? '',
        })
        setForm((f) => ({
          ...f,
          ...configData,
          joinchatId: widgetsData.joinchatId ?? '',
          whatsappNumber: widgetsData.whatsappNumber ?? '',
          widgetNiche: widgetsData.widgetNiche ?? '',
          footerCustomScripts: widgetsData.footerCustomScripts ?? '',
        }))
      } else {
        alert(configData.error || 'Erro ao salvar')
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
        {saveOk && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            Configurações salvas com sucesso (incluindo widgets e scripts do rodapé).
          </div>
        )}
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
          <h2 className="font-semibold mb-4">Widgets (GTM, Join.Chat)</h2>
          <p className="text-sm text-gray-500 mb-4">
            GTM: fallback global <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_GTM_ID</code> no .env (ERP).
            Cada cliente pode cadastrar o próprio container em <strong>Meu Perfil</strong> — prioridade sobre o .env.
            Evento <code className="text-xs">whatsapp_click</code> no dataLayer. Com WhatsApp preenchido, o ERP usa o
            botão flutuante verde (sem duplicar com o bundle). Join.Chat ID só é carregado se não houver número válido.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Join.Chat ID (bundle legado)</label>
              <input
                type="text"
                placeholder="Ex: 5abc123"
                value={form.joinchatId ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, joinchatId: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">WhatsApp (número padrão)</label>
              <input
                type="text"
                placeholder="5511999999999"
                value={form.whatsappNumber ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Nicho (texto da mensagem do widget)</label>
              <input
                type="text"
                placeholder="Ex: serviços de estética em São Paulo"
                value={form.widgetNiche ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, widgetNiche: e.target.value }))}
                className="input-field"
              />
              <p className="text-xs text-gray-500 mt-1">
                Usado em: &quot;Olá! Gostaria de mais informações sobre [nicho].&quot; Clientes podem definir o próprio
                nicho em Meu Perfil.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Scripts personalizados (footer)</label>
              <textarea
                rows={5}
                placeholder="HTML sanitizado (ex.: pixels, script src de CDN confiáveis). Scripts inline são removidos ao salvar."
                value={form.footerCustomScripts ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, footerCustomScripts: e.target.value }))}
                className="input-field font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-4">Plug & Play Black</h2>
          <div className="mb-8">
            <label className="block text-sm font-medium mb-1">Pagamento por conta que durou +24h (R$)</label>
            <input
              type="number"
              value={form.blackPagamentoPorConta24h}
              onChange={(e) => setForm((f) => ({ ...f, blackPagamentoPorConta24h: parseInt(e.target.value, 10) || 0 }))}
              className="input-field w-32"
            />
          </div>
          <h3 className="text-sm font-semibold mb-1">Remuneração – colaboradores Plug &amp; Play</h3>
          <p className="text-sm text-gray-500 mb-4">
            Salário base, metas e bônus (bronze / prata / ouro / meta / elite) usados no fechamento e saldo P&amp;P.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Salário base P&amp;P (R$/mês)</label>
              <input
                type="number"
                value={form.plugplaySalarioBase}
                onChange={(e) => setForm((f) => ({ ...f, plugplaySalarioBase: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meta diária P&amp;P</label>
              <input
                type="number"
                value={form.plugplayMetaDiaria}
                onChange={(e) => setForm((f) => ({ ...f, plugplayMetaDiaria: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meta mensal P&amp;P</label>
              <input
                type="number"
                value={form.plugplayMetaMensal}
                onChange={(e) => setForm((f) => ({ ...f, plugplayMetaMensal: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meta elite P&amp;P (contas)</label>
              <input
                type="number"
                value={form.plugplayMetaElite}
                onChange={(e) => setForm((f) => ({ ...f, plugplayMetaElite: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus bronze (R$)</label>
              <input
                type="number"
                value={form.plugplayBonusBronze}
                onChange={(e) => setForm((f) => ({ ...f, plugplayBonusBronze: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus prata (R$)</label>
              <input
                type="number"
                value={form.plugplayBonusPrata}
                onChange={(e) => setForm((f) => ({ ...f, plugplayBonusPrata: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus ouro (R$)</label>
              <input
                type="number"
                value={form.plugplayBonusOuro}
                onChange={(e) => setForm((f) => ({ ...f, plugplayBonusOuro: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus meta batida (R$)</label>
              <input
                type="number"
                value={form.plugplayBonusMeta}
                onChange={(e) => setForm((f) => ({ ...f, plugplayBonusMeta: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bônus elite (R$)</label>
              <input
                type="number"
                value={form.plugplayBonusElite}
                onChange={(e) => setForm((f) => ({ ...f, plugplayBonusElite: parseInt(e.target.value, 10) || 0 }))}
                className="input-field"
              />
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </form>
    </div>
  )
}
