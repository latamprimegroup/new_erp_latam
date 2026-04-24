import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    role: string
    cargo?: string | null
    leaderId?: string | null
    /** Status de aprovação: PENDING | ACTIVE | BANNED */
    status?: string
    /** pt-BR | en-US | es — preferência de idioma (área cliente) */
    languageCode?: string
    /** Só no fluxo de login (JWT); não exposto na sessão */
    remember?: boolean
  }

  interface Session {
    user: User & {
      id: string
      role: string
      cargo?: string | null
      leaderId?: string | null
      status: string
      languageCode?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    cargo?: string | null
    leaderId?: string | null
    status: string
    languageCode?: string
  }
}
