'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function Form() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setMessage('As senhas não coincidem')
      return
    }
    if (password.length < 8) {
      setMessage('Mínimo 8 caracteres')
      return
    }
    setLoading(true)
    setMessage('')
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json()
    setLoading(false)
    if (res.ok) {
      setMessage('Senha alterada! Redirecionando...')
      setTimeout(() => window.location.href = '/login', 2000)
    } else {
      setMessage(data.error || 'Erro')
    }
  }

  if (!token) {
    return (
      <div className="card w-full max-w-md">
        <p className="text-red-600">Link inválido. Solicite uma nova redefinição.</p>
        <Link href="/recuperar-senha" className="link-primary mt-4 inline-block">Esqueci minha senha</Link>
      </div>
    )
  }

  return (
    <div className="card w-full max-w-md">
      <h1 className="text-xl font-bold text-[#1F2937] mb-6">Redefinir senha</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nova senha (mín. 8 caracteres)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Confirmar senha</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-field"
            required
          />
        </div>
        {message && <p className={`text-sm ${message.includes('!') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Salvando...' : 'Alterar senha'}
        </button>
      </form>
    </div>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#F8FAFC]">
      <Suspense fallback={<p>Carregando...</p>}>
        <Form />
      </Suspense>
    </main>
  )
}
