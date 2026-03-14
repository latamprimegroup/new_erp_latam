'use client'

import { useState } from 'react'

type Category = 'SYSTEM' | 'COMPANY'

export function ProductionFeedback() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<Category>('SYSTEM')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    setSubmitting(true)
    setSuccess(false)
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        title: title.trim(),
        description: description.trim(),
        anonymous: category === 'COMPANY' ? anonymous : undefined,
      }),
    })
    if (res.ok) {
      setTitle('')
      setDescription('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao enviar')
    }
    setSubmitting(false)
  }

  return (
    <div className="production-form-area border-t border-gray-200 dark:border-white/10 pt-4 mt-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
      >
        <span>💡 Central de Feedback e Melhoria Contínua</span>
        <span className="text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCategory('SYSTEM')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                category === 'SYSTEM'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Sugestões de Melhoria (Sistema)
            </button>
            <button
              type="button"
              onClick={() => setCategory('COMPANY')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                category === 'COMPANY'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Sugestões de Melhoria (Empresa)
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {category === 'SYSTEM'
              ? 'Bugs, novas funções, melhorias no software. Destino: backlog da equipe de TI.'
              : 'Processos, cultura, operação. Pode ser anônimo. Destino: direção/administração.'}
          </p>
          <form onSubmit={handleSubmit} className="space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="Título"
              required
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field min-h-[80px]"
              placeholder="Descrição"
              required
            />
            {category === 'COMPANY' && (
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                Enviar de forma anônima
              </label>
            )}
            <button type="submit" disabled={submitting} className="btn-secondary text-sm py-2 px-4">
              {submitting ? 'Enviando...' : 'Enviar Sugestão'}
            </button>
          </form>
          {success && (
            <p className="text-sm text-green-600 dark:text-green-400">✓ Sugestão enviada com sucesso!</p>
          )}
        </div>
      )}
    </div>
  )
}
