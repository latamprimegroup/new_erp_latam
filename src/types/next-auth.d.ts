import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    role: string
    /** pt-BR | en-US | es — preferência de idioma (área cliente) */
    languageCode?: string
    /** Só no fluxo de login (JWT); não exposto na sessão */
    remember?: boolean
  }

  interface Session {
    user: User & {
      id: string
      role: string
      /** Preferência i18n; pode faltar em sessões antigas até novo login */
      languageCode?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    languageCode?: string
  }
}
