import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'
import { verifyTurnstileToken } from './turnstile'

const VERBOSE_LOGIN = process.env.LOGIN_VERBOSE_ERRORS === 'true'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
        turnstileToken: { label: 'Turnstile', type: 'text' },
        remember: { label: 'Remember', type: 'text' },
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

        const emailNorm = credentials.email.trim().toLowerCase()
        const user = await prisma.user.findUnique({
          where: { email: emailNorm },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            photo: true,
            passwordHash: true,
            languageCode: true,
          },
        })

        if (!user || !user.passwordHash) {
          if (VERBOSE_LOGIN) {
            throw new Error(
              'Não encontramos cadastro com este e-mail. Verifique ou cadastre-se.'
            )
          }
          return null
        }

        const valid = await compare(credentials.password, user.passwordHash)
        if (!valid) {
          if (VERBOSE_LOGIN) {
            throw new Error('Senha incorreta. Tente novamente ou use “Esqueceu a senha?”.')
          }
          return null
        }

        const remember =
          credentials.remember === 'true' || credentials.remember === 'on' || credentials.remember === '1'

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.photo,
          remember,
          languageCode: user.languageCode,
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
        token.id = user.id
        token.role = user.role
        token.languageCode = (user as { languageCode?: string }).languageCode ?? 'pt-BR'
        const remember = !!(user as { remember?: boolean }).remember
        /** Sessão curta sem “manter conectado”; longa com checkbox (dias). */
        const shortSec = parseInt(process.env.SESSION_SHORT_MAX_AGE_SEC || `${14 * 60 * 60}`, 10)
        const longSec = parseInt(process.env.SESSION_LONG_MAX_AGE_SEC || `${30 * 24 * 60 * 60}`, 10)
        const durationSec = remember ? longSec : shortSec
        token.exp = Math.floor(Date.now() / 1000) + durationSec
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.languageCode = (token.languageCode as string) ?? 'pt-BR'
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    /** Teto máximo; a duração efetiva vem de `token.exp` no callback jwt (remember). */
    maxAge: 30 * 24 * 60 * 60,
  },
  events: {
    async signIn({ user }) {
      if (!user?.id) return
      const row = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        select: { role: true },
      })
      if (row.role === 'CLIENT') {
        await prisma.clientProfile.updateMany({
          where: { userId: user.id },
          data: { tintimFollowupPending: false },
        })
      }
    },
  },
}
