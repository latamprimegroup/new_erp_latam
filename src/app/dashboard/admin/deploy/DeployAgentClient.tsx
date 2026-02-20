'use client'

import { useState, useEffect } from 'react'

type StepResult = {
  step: string
  ok: boolean
  message: string
  userMessage: string
}

type Status = {
  canDeploy: boolean
  currentVersion: string
  steps: StepResult[]
  nextStep: string | null
  productionActive: boolean
}

const STEP_LABELS: Record<string, string> = {
  ENV_CHECK: 'Verificando ambiente',
  DB_CONNECT: 'Conectando ao banco',
  DB_MIGRATE: 'Criando banco de dados',
  DB_SEED: 'Criando administrador',
  VALIDATE: 'Validando sistema',
  DONE: 'Concluído',
}

export function DeployAgentClient() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'idle' | 'migrate' | 'seed' | 'complete'>('idle')
  const [error, setError] = useState('')
  const [seedEmail, setSeedEmail] = useState('')
  const [seedPassword, setSeedPassword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/deploy/check')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus(null)
      setError('Não foi possível verificar o ambiente.')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function runMigrate() {
    setAction('migrate')
    setError('')
    try {
      const res = await fetch('/api/admin/deploy/migrate', { method: 'POST' })
      const data = await res.json()
      if (res.ok) await load()
      else setError(data.message || 'Erro ao migrar')
    } catch {
      setError('Erro ao executar migração')
    }
    setAction('idle')
  }

  async function runSeed(e: React.FormEvent) {
    e.preventDefault()
    if (!seedEmail || !seedPassword) return
    setAction('seed')
    setError('')
    try {
      const res = await fetch('/api/admin/deploy/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: seedEmail, password: seedPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        await load()
        setSeedEmail('')
        setSeedPassword('')
      } else setError(data.message || 'Erro ao criar admin')
    } catch {
      setError('Erro ao criar administrador')
    }
    setAction('idle')
  }

  async function runComplete() {
    setAction('complete')
    setError('')
    try {
      const res = await fetch('/api/admin/deploy/complete', { method: 'POST' })
      const data = await res.json()
      if (res.ok) await load()
      else setError(data.message || 'Erro')
    } catch {
      setError('Erro ao finalizar')
    }
    setAction('idle')
  }

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const showSimpleMode = !status?.productionActive && status?.canDeploy
  const needsMigrate = status?.nextStep === 'DB_MIGRATE'
  const needsSeed = status?.nextStep === 'DB_SEED'

  return (
    <div className="space-y-6">
      {/* Modo Simples - Botão único */}
      {showSimpleMode && (
        <div className="card bg-gradient-to-br from-primary-50 to-white border-2 border-primary-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            Colocar ERP no Ar
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Clique no botão para configurar o sistema automaticamente.
          </p>

          {/* Barra de progresso visual */}
          <div className="space-y-2 mb-6">
            {status?.steps.map((s, i) => (
              <div
                key={s.step}
                className={`flex items-center gap-3 text-sm ${
                  s.ok ? 'text-emerald-600' : needsMigrate && s.step === 'DB_MIGRATE' ? 'text-amber-600' : 'text-slate-500'
                }`}
              >
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-current/10">
                  {s.ok ? '✔' : i + 1}
                </span>
                <span>{s.userMessage}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {needsMigrate && (
            <button
              onClick={runMigrate}
              disabled={action === 'migrate'}
              className="btn-primary w-full py-4 text-lg"
            >
              {action === 'migrate'
                ? 'Criando banco de dados…'
                : 'Criar banco de dados'}
            </button>
          )}

          {needsSeed && (
            <form onSubmit={runSeed} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  E-mail do administrador
                </label>
                <input
                  type="email"
                  value={seedEmail}
                  onChange={(e) => setSeedEmail(e.target.value)}
                  className="input-field"
                  placeholder="admin@empresa.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Senha (mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  value={seedPassword}
                  onChange={(e) => setSeedPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>
              <button
                type="submit"
                disabled={action === 'seed'}
                className="btn-primary w-full py-4 text-lg"
              >
                {action === 'seed'
                  ? 'Criando administrador…'
                  : 'Criar administrador'}
              </button>
            </form>
          )}

          {status?.productionActive && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
              <p className="text-emerald-700 font-medium text-lg">ERP está no ar com sucesso!</p>
              <p className="text-emerald-600 text-sm mt-1">Sistema em produção ativa</p>
            </div>
          )}
        </div>
      )}

      {/* Status técnico */}
      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-3">Status do ambiente</h3>
        <div className="space-y-2 text-sm">
          <p>
            Versão: <span className="font-mono">{status?.currentVersion || '—'}</span>
          </p>
          <p>
            Produção ativa: {status?.productionActive ? '✔ Sim' : '✗ Não'}
          </p>
          <p>
            Próximo passo: {status?.nextStep ? STEP_LABELS[status.nextStep] || status.nextStep : 'Nenhum'}
          </p>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={load} className="text-sm link-primary">
            Atualizar verificação
          </button>
          <a
            href="/api/health/detailed"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm link-primary"
          >
            Diagnóstico detalhado
          </a>
        </div>
      </div>
    </div>
  )
}
