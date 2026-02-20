'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [resetLink, setResetLink] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setResetLink('')
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    setLoading(false)
    if (res.ok) {
      setMessage(data.message || 'Verifique seu e-mail.')
      if (data.resetLink) setResetLink(data.resetLink)
    } else {
      setMessage(data.error || 'Erro ao enviar')
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F8FAFC] dark:bg-ads-dark-bg relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-md mt-8">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block mb-4">
            <Image src="/logo-ads-ativos.png" alt="ADS Ativos" width={120} height={40} className="h-10 w-auto mx-auto" priority />
          </Link>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Esqueci minha senha
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          Informe seu e-mail para receber o link de redefinição.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="seu@email.com"
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>

        {message && (
          <div className="mt-4 p-3 rounded-lg bg-gray-100 dark:bg-white/10 text-sm text-gray-900 dark:text-gray-100">
            {message}
            {resetLink && (
              <p className="mt-2 break-all">
                <a href={resetLink} className="link-primary">
                  Clique aqui para redefinir
                </a>
              </p>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="link-primary">
            Voltar ao login
          </Link>
        </p>
      </div>
    </main>
  )
}
