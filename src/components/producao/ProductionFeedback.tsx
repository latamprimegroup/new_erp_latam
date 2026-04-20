'use client'

import { useState } from 'react'
import { MessageSquare, Building2 } from 'lucide-react'

/**
 * Wireframe: dois acessos rápidos lado a lado — Sistema (ERP) e Empresa (anônimo opcional).
 */
export function ProductionFeedback() {
  const [sysTitle, setSysTitle] = useState('')
  const [sysDesc, setSysDesc] = useState('')
  const [coTitle, setCoTitle] = useState('')
  const [coDesc, setCoDesc] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState<'SYSTEM' | 'COMPANY' | null>(null)
  const [okSystem, setOkSystem] = useState(false)
  const [okCompany, setOkCompany] = useState(false)

  async function send(category: 'SYSTEM' | 'COMPANY') {
    const title = category === 'SYSTEM' ? sysTitle.trim() : coTitle.trim()
    const description = category === 'SYSTEM' ? sysDesc.trim() : coDesc.trim()
    if (!title || !description) return
    setSubmitting(category)
    if (category === 'SYSTEM') setOkSystem(false)
    else setOkCompany(false)
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        title,
        description,
        anonymous: category === 'COMPANY' ? anonymous : undefined,
      }),
    })
    if (res.ok) {
      if (category === 'SYSTEM') {
        setSysTitle('')
        setSysDesc('')
        setOkSystem(true)
        setTimeout(() => setOkSystem(false), 4000)
      } else {
        setCoTitle('')
        setCoDesc('')
        setAnonymous(false)
        setOkCompany(true)
        setTimeout(() => setOkCompany(false), 4000)
      }
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao enviar')
    }
    setSubmitting(null)
  }

  return (
    <section
      className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-600/50"
      aria-labelledby="producao-feedback-heading"
    >
      <h2 id="producao-feedback-heading" className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        Central de Feedback e Melhoria Contínua
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-3xl">
        Canal direto para o time de TI (sistema) e para direção/operação (empresa). A segunda opção pode ser anônima.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-600/60 bg-white dark:bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-primary-600 dark:text-primary-400">
            <MessageSquare className="w-5 h-5 shrink-0" aria-hidden />
            <h3 className="font-medium text-gray-900 dark:text-gray-100">💡 Sugestão: Melhoria do Sistema</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Bugs, novas funções e melhorias no ERP. Destino: backlog de desenvolvimento.
          </p>
          <div className="space-y-2">
            <input
              type="text"
              value={sysTitle}
              onChange={(e) => setSysTitle(e.target.value)}
              className="input-field text-sm"
              placeholder="Título"
              aria-label="Título sugestão sistema"
            />
            <textarea
              value={sysDesc}
              onChange={(e) => setSysDesc(e.target.value)}
              className="input-field text-sm min-h-[88px]"
              placeholder="Descrição"
              aria-label="Descrição sugestão sistema"
            />
            <button
              type="button"
              disabled={submitting === 'SYSTEM'}
              onClick={() => void send('SYSTEM')}
              className="btn-primary text-sm py-2 w-full sm:w-auto"
            >
              {submitting === 'SYSTEM' ? 'Enviando…' : 'Enviar sugestão'}
            </button>
            {okSystem && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
                Sugestão enviada. Obrigado.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-amber-800 dark:text-amber-200">
            <Building2 className="w-5 h-5 shrink-0" aria-hidden />
            <h3 className="font-medium text-gray-900 dark:text-gray-100">📢 Sugestão: Melhoria da Empresa</h3>
          </div>
          <p className="text-xs text-gray-600 dark:text-amber-100/80 mb-3">
            Processos, cultura e operação. Pode enviar sem identificação.
          </p>
          <div className="space-y-2">
            <input
              type="text"
              value={coTitle}
              onChange={(e) => setCoTitle(e.target.value)}
              className="input-field text-sm bg-white dark:bg-slate-950/80"
              placeholder="Título"
              aria-label="Título sugestão empresa"
            />
            <textarea
              value={coDesc}
              onChange={(e) => setCoDesc(e.target.value)}
              className="input-field text-sm min-h-[88px] bg-white dark:bg-slate-950/80"
              placeholder="Descrição"
              aria-label="Descrição sugestão empresa"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="rounded border-gray-400"
              />
              Enviar de forma anônima
            </label>
            <button
              type="button"
              disabled={submitting === 'COMPANY'}
              onClick={() => void send('COMPANY')}
              className="w-full sm:w-auto rounded-lg bg-amber-700 hover:bg-amber-600 dark:bg-amber-800 dark:hover:bg-amber-700 text-white text-sm font-medium py-2 px-4 disabled:opacity-50"
            >
              {submitting === 'COMPANY' ? 'Enviando…' : 'Enviar sugestão'}
            </button>
            {okCompany && (
              <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
                Sugestão enviada. Obrigado.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
