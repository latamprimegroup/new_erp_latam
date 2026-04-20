'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'

type Briefing = { id: string; nomeEmpresa: string; nomeFantasia: string | null; nicho: string; cidade: string; estado: string }
type FormInput = { nomeEmpresa: string; nicho: string; cidade: string; estado: string; cnpj?: string; endereco?: string; whatsapp?: string; servicos: string }

const queryClient = new QueryClient()

function Inner() {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [ads, setAds] = useState<any>(null)
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormInput>()

  const briefingsQ = useQuery({
    queryKey: ['briefings'],
    queryFn: async () => {
      const r = await fetch('/api/cliente/landing-briefing')
      const d = await r.json()
      return (d.briefings || []) as Briefing[]
    },
  })

  const createMut = useMutation({
    mutationFn: async (payload: FormInput) => {
      const r = await fetch('/api/cliente/landing-briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error((await r.json()).error || 'Erro')
      return r.json()
    },
    onSuccess: () => {
      void briefingsQ.refetch()
      reset()
    },
  })

  async function generateSite(briefingId: string) {
    const r = await fetch('/api/cliente/landing-briefing/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ briefingId }) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Erro ao gerar site')
    setPreviewHtml(d.html)
  }

  async function generateAds(briefingId: string) {
    const r = await fetch('/api/cliente/landing-briefing/google-ads-structured', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ briefingId }) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Erro ao gerar campanhas')
    setAds(d)
  }

  const onSubmit = handleSubmit(async (values) => {
    await createMut.mutateAsync(values)
  })

  const copy = async (txt: string) => navigator.clipboard.writeText(txt)

  return (
    <div className="space-y-6">
      <div className="card border-violet-500/20">
        <h2 className="font-semibold mb-3">Novo briefing rapido</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="input-field" placeholder="Nome da empresa" {...register('nomeEmpresa', { required: true })} />
          <input className="input-field" placeholder="Nicho" {...register('nicho', { required: true })} />
          <input className="input-field" placeholder="Cidade" {...register('cidade', { required: true })} />
          <input className="input-field" placeholder="UF" {...register('estado', { required: true })} />
          <input className="input-field md:col-span-2" placeholder="Endereco" {...register('endereco')} />
          <input className="input-field" placeholder="CNPJ" {...register('cnpj')} />
          <input className="input-field" placeholder="WhatsApp" {...register('whatsapp')} />
          <textarea className="input-field md:col-span-2 min-h-[80px]" placeholder="Servicos (um por linha)" {...register('servicos', { required: true })} />
          <button disabled={isSubmitting || createMut.isPending} className="btn-primary text-sm md:col-span-2">
            {isSubmitting || createMut.isPending ? 'Salvando...' : 'Salvar briefing'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Briefings salvos</h2>
        <div className="space-y-2">
          {(briefingsQ.data || []).map((b) => (
            <div key={b.id} className="rounded-lg border border-white/10 p-3 flex items-center justify-between gap-2">
              <p className="text-sm">{b.nomeFantasia || b.nomeEmpresa} - {b.nicho} - {b.cidade}/{b.estado}</p>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs" onClick={() => void generateSite(b.id)}>Gerar site</button>
                <button className="btn-primary text-xs" onClick={() => void generateAds(b.id)}>Gerar campanhas</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewHtml && (
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Preview do site (mobile-first)</h3>
            <button className="btn-secondary text-xs" onClick={() => void copy(previewHtml)}>Copiar HTML</button>
          </div>
          <p className="text-xs text-amber-400 mb-2">Compliance: revise claims, dados legais e contato oficial antes de publicar.</p>
          <iframe srcDoc={previewHtml} className="w-full h-[60vh] rounded-lg border border-white/10 bg-white" sandbox="allow-scripts" title="preview-site" />
        </div>
      )}

      {ads && (
        <div className="card space-y-4">
          <h3 className="font-semibold">Campanhas Search geradas</h3>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            {ads.complianceWarnings?.map((w: string) => <p key={w}>- {w}</p>)}
          </div>
          {ads.blocks?.map((b: any, idx: number) => (
            <div key={idx} className="rounded-lg border border-violet-500/20 p-3 space-y-2">
              <p className="text-sm font-medium">{b.campaign}</p>
              <p className="text-xs text-gray-400">Grupo: {b.adGroup}</p>
              <button className="btn-secondary text-xs" onClick={() => void copy(b.keywordsPhrase.join('\n'))}>Copiar Keywords (Frase)</button>
              <button className="btn-secondary text-xs ml-2" onClick={() => void copy(b.keywordsExact.join('\n'))}>Copiar Keywords (Exata)</button>
              <button className="btn-secondary text-xs ml-2" onClick={() => void copy(b.negatives.join('\n'))}>Copiar Negativas</button>
              <button className="btn-primary text-xs ml-2" onClick={() => void copy(b.headlines.join('\n'))}>Copiar 15 Headlines</button>
              <button className="btn-primary text-xs ml-2" onClick={() => void copy(b.descriptions.join('\n'))}>Copiar 4 Descricoes</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ClientAssetGeneratorClient() {
  return (
    <QueryClientProvider client={queryClient}>
      <Inner />
    </QueryClientProvider>
  )
}
