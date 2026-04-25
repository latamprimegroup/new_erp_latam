import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'
import { verifyTurnstileToken } from './turnstile'

const VERBOSE_LOGIN = process.env.LOGIN_VERBOSE_ERRORS === 'true'

// Helper para gravar auditoria de login sem bloquear o fluxo
async function auditLogin(opts: {
  email: string; userId?: string; success: boolean
  ip: string; userAgent?: string; reason?: string
}) {
  try {
    await prisma.loginAuditLog.create({
      data: {
        email:     opts.email,
        userId:    opts.userId,
        success:   opts.success,
        ip:        opts.ip,
        userAgent: opts.userAgent,
        reason:    opts.reason,
      },
    })
    // Alerta no painel: 5+ falhas em 10 min do mesmo IP → grava memória ALFREDO IA
    if (!opts.success) {
      const since = new Date(Date.now() - 10 * 60 * 1000)
      const fails = await prisma.loginAuditLog.count({
        where: { ip: opts.ip, success: false, createdAt: { gte: since } },
      })
      if (fails >= 5) {
        await prisma.alfredoMemory.create({
          data: {
            type:    'INSIGHT',
            title:   '🚨 Tentativas suspeitas de login',
            content: `IP ${opts.ip} teve ${fails} falhas de login nos últimos 10 minutos. E-mail: ${opts.email}. Verifique imediatamente.`,
          },
        }).catch(() => null)
      }
    }
  } catch { /* auditoria não deve travar login */ }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:          { label: 'E-mail',    type: 'email' },
        password:       { label: 'Senha',     type: 'password' },
        turnstileToken: { label: 'Turnstile', type: 'text' },
        remember:       { label: 'Remember',  type: 'text' },
        ip:             { label: 'IP',        type: 'text' },
        userAgent:      { label: 'UserAgent', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        if (process.env.TURNSTILE_SECRET_KEY) {
          const ok = await verifyTurnstileToken(credentials.turnstileToken)
          if (!ok) {
            throw new Error(
              'Falha na verificação anti-bot (Turnstile). Atualize a página e tente novamente.'
            )
          }
        }

        const ip        = credentials.ip        || 'unknown'
        const userAgent = credentials.userAgent || undefined
        const emailNorm = credentials.email.trim().toLowerCase()

        let user: {
          id: string; email: string; name: string | null; role: string;
          photo: string | null; passwordHash: string | null; languageCode: string | null;
          cargo?: string | null; leaderId?: string | null;
          status: string;
        } | null

        try {
          user = await prisma.user.findUnique({
            where:  { email: emailNorm },
            select: {
              id: true, email: true, name: true, role: true,
              photo: true, passwordHash: true, languageCode: true,
              status: true,
            },
          })
          // Campos de hierarquia comercial — carregados separadamente para
          // não bloquear login caso as colunas ainda não existam no banco de produção.
          if (user) {
            const extra = await prisma.user.findUnique({
              where: { id: user.id },
              select: { cargo: true, leaderId: true },
            }).catch(() => null)
            if (extra) {
              user = { ...user, cargo: extra.cargo, leaderId: extra.leaderId }
            }
          }
        } catch (dbErr) {
          console.error('[auth] Erro de conexão com o banco de dados:', dbErr)
          throw new Error('Serviço temporariamente indisponível. Tente novamente em alguns instantes.')
        }

        if (!user || !user.passwordHash) {
          await auditLogin({ email: emailNorm, success: false, ip, userAgent, reason: 'USER_NOT_FOUND' })
          if (VERBOSE_LOGIN) throw new Error('Não encontramos cadastro com este e-mail. Verifique ou cadastre-se.')
          return null
        }

        // ── Bloquear usuários banidos ────────────────────────────────────────
        if (user.status === 'BANNED') {
          await auditLogin({ email: emailNorm, userId: user.id, success: false, ip, userAgent, reason: 'BANNED' })
          throw new Error('Seu acesso foi revogado pelo administrador. Entre em contato com o suporte.')
        }

        const valid = await compare(credentials.password, user.passwordHash)
        if (!valid) {
          await auditLogin({ email: emailNorm, userId: user.id, success: false, ip, userAgent, reason: 'WRONG_PASSWORD' })
          if (VERBOSE_LOGIN) throw new Error('Senha incorreta. Tente novamente ou use "Esqueceu a senha?".')
          return null
        }

        // Login bem-sucedido — gravar auditoria
        await auditLogin({ email: emailNorm, userId: user.id, success: true, ip, userAgent })

        const remember =
          credentials.remember === 'true' || credentials.remember === 'on' || credentials.remember === '1'

        return {
          id:           user.id,
          email:        user.email,
          name:         user.name,
          role:         user.role,
          image:        user.photo ?? undefined,
          remember,
          languageCode: user.languageCode ?? undefined,
          cargo:        user.cargo ?? undefined,
          leaderId:     user.leaderId ?? undefined,
          status:       user.status,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === 'update' && session?.languageCode) {
        token.languageCode = session.languageCode as string
      }
      if (user) {
        token.id           = user.id
        token.role         = user.role
        token.status       = (user as { status?: string }).status ?? 'ACTIVE'
        token.languageCode = (user as { languageCode?: string }).languageCode ?? 'pt-BR'
        token.cargo        = (user as { cargo?: string }).cargo
        token.leaderId     = (user as { leaderId?: string }).leaderId
        const remember     = !!(user as { remember?: boolean }).remember
        const shortSec = parseInt(process.env.SESSION_SHORT_MAX_AGE_SEC || `${14 * 60 * 60}`, 10)
        const longSec  = parseInt(process.env.SESSION_LONG_MAX_AGE_SEC  || `${30 * 24 * 60 * 60}`, 10)
        token.exp      = Math.floor(Date.now() / 1000) + (remember ? longSec : shortSec)

        // Carrega profileType + activeModules para CLIENTs
        if ((user as { role?: string }).role === 'CLIENT') {
          const cp = await prisma.clientProfile.findUnique({
            where:  { userId: user.id },
            select: { profileType: true, activeModules: true },
          }).catch(() => null)
          token.profileType   = cp?.profileType ?? 'TRADER_WHATSAPP'
          token.activeModules = cp?.activeModules ?? []
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id            = token.id as string
        session.user.role          = token.role as string
        session.user.status        = token.status as string
        session.user.languageCode  = (token.languageCode as string) ?? 'pt-BR'
        session.user.cargo         = (token.cargo as string | undefined) ?? undefined
        session.user.leaderId      = (token.leaderId as string | undefined) ?? undefined
        session.user.profileType   = (token.profileType as string | undefined) ?? undefined
        session.user.activeModules = (token.activeModules as string[] | undefined) ?? undefined
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  session: {
    strategy: 'jwt',
    maxAge:   30 * 24 * 60 * 60,
  },
  events: {
    async signIn({ user }) {
      if (!user?.id) return
      try {
        const row = await prisma.user.update({
          where:  { id: user.id },
          data:   { lastLoginAt: new Date() },
          select: { role: true },
        })
        if (row.role === 'CLIENT') {
          await prisma.clientProfile.updateMany({
            where: { userId: user.id },
            data:  { tintimFollowupPending: false },
          })
        }
      } catch { /* eventos não devem bloquear a sessão */ }
    },
  },
}
