'use client'

import { useState, useEffect } from 'react'
import { Plus, FileText, Copy, Eye, Loader2, ChevronRight, Building2, MapPin, Megaphone } from 'lucide-react'

type Briefing = {
  id: string
  nomeEmpresa: string
  nomeFantasia: string | null
  nicho: string
  subnicho: string | null
  cidade: string
  estado: string
  whatsapp: string | null
  status: string
  servicos: string
  createdAt: string
  _count: { pages: number }
}

const OBJETIVOS = [
  { value: 'LIGACOES', label: 'Geração de ligações' },
  { value: 'WHATSAPP', label: 'Mensagens via WhatsApp' },
  { value: 'ORCAMENTO', label: 'Solicitação de orçamento' },
  { value: 'AGENDAMENTO', label: 'Agendamento' },
  { value: 'PRESENCIAL', label: 'Atendimento presencial' },
  { value: 'OUTRO', label: 'Outro' },
] as const

const INIT_FORM = {
  nomeEmpresa: '',
  nomeFantasia: '',
  nicho: '',
  subnicho: '',
  cidade: '',
  estado: '',
  cnpj: '',
  endereco: '',
  telefone: '',
  whatsapp: '',
  email: '',
  horarioAtendimento: '',
  servicos: '',
  anosExperiencia: '',
  diferenciais: '',
  objetivo: '',
  objetivoOutro: '',
  tipoCliente: '',
  problemasDemandas: '',
  restricoes: '',
}

export function LandingFactoryClient() {
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'list' | 'form'>('list')
  const [form, setForm] = useState(INIT_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [generatingAds, setGeneratingAds] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [googleAdsStructure, setGoogleAdsStructure] = useState<string | null>(null)
  const [error, setError] = useState('')

  function load() {
    fetch('/api/cliente/landing-briefing')
      .then((r) => r.json())
      .then((d) => {
        setBriefings(Array.isArray(d?.briefings) ? d.briefings : [])
      })
      .catch(() => setBriefings([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreateBriefing(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/cliente/landing-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
      setStep('list')
      setForm(INIT_FORM)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGenerate(briefingId: string) {
    setError('')
    setGenerating(briefingId)
    try {
      const res = await fetch('/api/cliente/landing-briefing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefingId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar')
      setPreviewHtml(data.html)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar')
    } finally {
      setGenerating(null)
    }
  }

  function copyHtml(html: string) {
    navigator.clipboard.writeText(html)
    alert('Copiado!')
  }

  async function handleGenerateAds(briefingId: string) {
    setError('')
    setGeneratingAds(briefingId)
    setGoogleAdsStructure(null)
    try {
      const res = await fetch('/api/cliente/landing-briefing/google-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefingId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar')
      setGoogleAdsStructure(data.structure)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar Google Ads')
    } finally {
      setGeneratingAds(null)
    }
  }

  if (googleAdsStructure) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => setGoogleAdsStructure(null)}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← Voltar
          </button>
          <button
            type="button"
            onClick={() => copyHtml(googleAdsStructure!)}
            className="btn-primary flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copiar Estrutura Completa
          </button>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
            Estrutura Google Ads – Rede de Pesquisa
          </h3>
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-300 overflow-x-auto max-h-[70vh] overflow-y-auto pr-4">
            {googleAdsStructure}
          </pre>
        </div>
      </div>
    )
  }

  if (previewHtml) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPreviewHtml(null)}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← Voltar
          </button>
          <button
            type="button"
            onClick={() => copyHtml(previewHtml!)}
            className="btn-primary flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copiar HTML
          </button>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
          <iframe
            srcDoc={previewHtml}
            title="Preview"
            className="w-full h-[70vh] bg-white"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    )
  }

  if (step === 'form') {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Briefing Oficial – Site Profissional para Negócio Local
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Padrão Google Ads | SEO Local | Conversão | Compliance Total. Após preencher, o briefing será convertido em prompt avançado e a IA gerará todo o site.
        </p>
        <form onSubmit={handleCreateBriefing} className="space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <section>
            <h3 className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200 mb-3">
              1️⃣ <Building2 className="w-4 h-4" /> Identidade da Empresa
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da empresa (exatamente como será exibido) *</label>
                <input
                  type="text"
                  value={form.nomeEmpresa}
                  onChange={(e) => setForm((p) => ({ ...p, nomeEmpresa: e.target.value }))}
                  placeholder="Razão social"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome fantasia</label>
                <input
                  type="text"
                  value={form.nomeFantasia}
                  onChange={(e) => setForm((p) => ({ ...p, nomeFantasia: e.target.value }))}
                  placeholder="Como o cliente conhece"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nicho *</label>
                <input
                  type="text"
                  value={form.nicho}
                  onChange={(e) => setForm((p) => ({ ...p, nicho: e.target.value }))}
                  placeholder="Ex: Clínica de fisioterapia"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subnicho (se houver)</label>
                <input
                  type="text"
                  value={form.subnicho}
                  onChange={(e) => setForm((p) => ({ ...p, subnicho: e.target.value }))}
                  placeholder="Ex: Reabilitação esportiva"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CNPJ (se houver)</label>
                <input
                  type="text"
                  value={form.cnpj}
                  onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))}
                  placeholder="00.000.000/0001-00"
                  className="input-field"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endereço físico completo</label>
                <input
                  type="text"
                  value={form.endereco}
                  onChange={(e) => setForm((p) => ({ ...p, endereco: e.target.value }))}
                  placeholder="Rua, número, bairro, CEP"
                  className="input-field"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200 mb-3">
              <MapPin className="w-4 h-4" /> Cidade e Estado
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cidade *</label>
                <input
                  type="text"
                  value={form.cidade}
                  onChange={(e) => setForm((p) => ({ ...p, cidade: e.target.value }))}
                  placeholder="São Paulo"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado *</label>
                <input
                  type="text"
                  value={form.estado}
                  onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="SP"
                  className="input-field"
                  required
                  maxLength={2}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">2️⃣ Contato Oficial</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefone principal (ligação)</label>
                <input
                  type="text"
                  value={form.telefone}
                  onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))}
                  placeholder="1133334444"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">WhatsApp (atendimento)</label>
                <input
                  type="text"
                  value={form.whatsapp}
                  onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
                  placeholder="5511999999999"
                  className="input-field"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-mail profissional</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="contato@empresa.com"
                  className="input-field"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Horário de atendimento</label>
                <input
                  type="text"
                  value={form.horarioAtendimento}
                  onChange={(e) => setForm((p) => ({ ...p, horarioAtendimento: e.target.value }))}
                  placeholder="Seg a Sex, 8h às 18h"
                  className="input-field"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">3️⃣ Serviços Oferecidos</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Liste TODOS os serviços que deseja divulgar (um por linha)</p>
            <textarea
              value={form.servicos}
              onChange={(e) => setForm((p) => ({ ...p, servicos: e.target.value }))}
              placeholder="Consultoria empresarial&#10;Planejamento tributário&#10;Abertura de empresas"
              className="input-field min-h-[100px] font-mono text-sm"
              required
            />
          </section>

          <section>
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">4️⃣ Diferenciais e Posicionamento</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Anos de experiência (se houver)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.anosExperiencia}
                  onChange={(e) => setForm((p) => ({ ...p, anosExperiencia: e.target.value }))}
                  placeholder="Ex: 10"
                  className="input-field"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Diferenciais reais do negócio</label>
              <textarea
                value={form.diferenciais}
                onChange={(e) => setForm((p) => ({ ...p, diferenciais: e.target.value }))}
                placeholder="Atendimento local, experiência no segmento, transparência"
                className="input-field min-h-[80px]"
              />
            </div>
          </section>

          <section>
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">5️⃣ Objetivo Principal do Site</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Marque apenas UM</p>
            <div className="space-y-2">
              {OBJETIVOS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="objetivo"
                    value={o.value}
                    checked={form.objetivo === o.value}
                    onChange={() => setForm((p) => ({ ...p, objetivo: o.value }))}
                    className="rounded-full text-primary-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{o.label}</span>
                </label>
              ))}
              {form.objetivo === 'OUTRO' && (
                <input
                  type="text"
                  value={form.objetivoOutro}
                  onChange={(e) => setForm((p) => ({ ...p, objetivoOutro: e.target.value }))}
                  placeholder="Especifique o objetivo"
                  className="input-field mt-2 ml-6"
                />
              )}
            </div>
          </section>

          <section>
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">6️⃣ Perfil do Cliente Ideal</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de cliente</label>
                <input
                  type="text"
                  value={form.tipoCliente}
                  onChange={(e) => setForm((p) => ({ ...p, tipoCliente: e.target.value }))}
                  placeholder="Ex: Donos de clínicas e consultórios"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Problemas/demandas mais comuns</label>
                <textarea
                  value={form.problemasDemandas}
                  onChange={(e) => setForm((p) => ({ ...p, problemasDemandas: e.target.value }))}
                  placeholder="Ex: Precisa de contabilidade especializada, burocracia tributária"
                  className="input-field min-h-[60px]"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">7️⃣ Restrições Importantes (se houver)</h3>
            <input
              type="text"
              value={form.restricoes}
              onChange={(e) => setForm((p) => ({ ...p, restricoes: e.target.value }))}
              placeholder="Ex: não falar de preço, não usar determinadas palavras"
              className="input-field"
            />
          </section>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Salvar e Gerar Site
            </button>
            <button
              type="button"
              onClick={() => setStep('list')}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Seus briefings e sites gerados</p>
        <button
          type="button"
          onClick={() => setStep('form')}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Novo Site
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-ads-dark-card animate-pulse"
            />
          ))}
        </div>
      ) : briefings.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-ads-dark-card/50 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-2">Nenhum briefing ainda</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Crie um briefing completo e gere seu site profissional em um clique
          </p>
          <button
            type="button"
            onClick={() => setStep('form')}
            className="btn-primary"
          >
            Criar primeiro briefing
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {briefings.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {b.nomeFantasia || b.nomeEmpresa || b.nicho}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {b.nicho} · {b.cidade}/{b.estado}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {b._count.pages} página(s) · {b.status}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleGenerate(b.id)}
                  disabled={generating === b.id}
                  className="btn-primary flex items-center gap-2 text-sm py-2"
                >
                  {generating === b.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  Gerar Site
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateAds(b.id)}
                  disabled={generatingAds === b.id}
                  className="btn-secondary flex items-center gap-2 text-sm py-2"
                >
                  {generatingAds === b.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Megaphone className="w-4 h-4" />
                  )}
                  Google Ads
                </button>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
    </div>
  )
}
