# ERP Ads Ativos

Sistema de gestão de produção, estoque, vendas, entregas, financeiro, metas e bônus — baseado no wireframe completo.

## Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Banco**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth.js (JWT, roles)

## Pré-requisitos

- Node.js 18+
- PostgreSQL

## Configuração

```bash
# Instalar dependências
npm install

# Copiar variáveis de ambiente
cp .env.example .env
# Editar .env com DATABASE_URL e NEXTAUTH_SECRET

# Gerar cliente Prisma e criar tabelas
npm run db:generate
npm run db:push
```

## Rodar o projeto

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Estrutura do Projeto

```
src/
├── app/              # Next.js App Router
│   ├── api/          # API Routes
│   ├── dashboard/    # Área interna (ERP)
│   ├── login/        # Login
│   └── cadastro/     # Cadastro 7 passos (área do cliente)
├── components/       # Componentes reutilizáveis
├── lib/              # Prisma, Auth
└── types/            # Tipos TypeScript
prisma/
└── schema.prisma     # Modelagem completa
```

## Módulos (wireframe)

| Módulo | Rota | Roles |
|--------|------|-------|
| Produção | /dashboard/producao | Produtor, Admin |
| Estoque | /dashboard/estoque | Financeiro, Admin |
| Base (E-mails/CNPJs) | /dashboard/base | Admin |
| Vendas | /dashboard/vendas | Comercial, Admin |
| Entregas | /dashboard/entregas | Entregador, Admin |
| Financeiro | /dashboard/financeiro | Financeiro, Admin |
| Saques | /dashboard/saques | Financeiro, Admin |
| Metas & Bônus | /dashboard/metas | Produtor, Admin |
| Admin/Auditoria | /dashboard/admin | Admin |
| Relatórios | /dashboard/relatorios | Comercial, Admin |

## Próximos Passos

1. Implementar telas de cada módulo com tabelas e formulários
2. Integração Airtable (opcional, migrar depois para PostgreSQL)
3. Integração Banco Inter (PIX)
4. Integração WhatsApp (cotações, alertas)
5. PWA para mobile
6. 2FA para Admin/Financeiro
