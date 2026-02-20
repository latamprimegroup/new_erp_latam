# ERP Ads Ativos — Especificação Técnica

> Análise ALFREDO | Wireframe completo

---

## 1. Resumo do Sistema

| Item | Detalhe |
|------|---------|
| **Nome** | ERP Ads Ativos |
| **Objetivo** | Gerenciar produção, estoque, vendas, entregas, financeiro, metas e bônus com dashboards web + apps mobile |
| **Integrações** | Airtable, Retool/Softr, Make/n8n, Banco Inter (PIX), WhatsApp |

---

## 2. Módulos e Personas

### 2.1 Roles (Permissões)

| Role | Acesso |
|------|--------|
| **Produtor** | Produção, Metas |
| **Entregador** | Entregas |
| **Financeiro** | Financeiro, Saques |
| **Comercial** | Vendas, Relatórios |
| **Admin** | Todos os setores |
| **Cliente** | Área do cliente (compras, cotações, perfil) |
| **Gestor** | Lançar contas, gerenciar contas, relatórios |

### 2.2 Módulos Internos (ERP)

| Módulo | Telas | Permissão |
|--------|-------|-----------|
| Produção de Contas | KPIs, tabela, formulário | Produtor |
| Estoque de Contas | Tabela, cards críticos, gráfico | Admin, Financeiro |
| Base E-mails/CNPJs/Perfis | 3 tabelas separadas | Admin |
| Vendas | Tabela, KPI, Registrar Venda | Comercial, Admin |
| Entregas | Tabela, KPI, Registrar Entrega | Entregador, Admin |
| Financeiro | Tabela, fluxo de caixa | Financeiro, Admin |
| Saques | Tabela, alertas | Financeiro, Admin |
| Metas & Bônus | Cards progresso, tabela | Produtor, Admin |
| Admin/Auditoria | Dashboard geral, logs, alertas | Admin |
| Relatórios & KPIs | Gráficos, filtros, export | Admin, Comercial |

### 2.3 Áreas Externas

| Área | Funcionalidades |
|------|-----------------|
| **Cliente** | Login, cadastro 7 passos, dashboard, pesquisa contas, minhas compras, editar perfil, suporte |
| **Gestor** | Dashboard, lançar conta, gerenciar contas, relatórios, configurações |
| **Admin Web** | Dashboard, gestores, usuários, vendas, contas ofertadas, contas compradas/rejeitadas |

---

## 3. Entidades e Relacionamentos

```
users (id, email, password, name, phone, photo, role, created_at, updated_at)
  ├── producers (user_id) — Produtor
  ├── deliverers (user_id) — Entregador
  ├── clients (user_id) — Cliente (área do cliente)
  └── managers (user_id) — Gestor (oferece contas)

accounts (id, platform, type, status, producer_id, client_id, created_at, ...)
  ├── production_accounts — Produção
  └── stock_accounts — Estoque

emails (id, email, recovery, password_hash, status, account_id)
cnpjs (id, cnpj, razao_social, cnae, status, account_id, payment_profile_id)
payment_profiles (id, type, gateway, status, cnpj_id, account_id)

orders (id, client_id, country, product, account_type, quantity, value, status, seller_id)
deliveries (id, order_id, qty_sold, qty_delivered, accounts_delivered, status, sla, responsible_id)

financial_entries (id, type, category, cost_center, value, date, order_id, net_profit)
withdrawals (id, gateway, account_id, value, fee, net_value, status, due_date, risk)

goals (id, user_id, daily_target, monthly_target, production_current, bonus, status)
bonus_releases (id, goal_id, value, status, released_at)
```

---

## 4. Fluxos Principais

1. **Produção** → Produtor registra conta → vai para Estoque
2. **Venda** → Cliente solicita cotação (WhatsApp) → comercial aprova → PIX → libera conta
3. **Entrega** → Entregador confirma → atualiza status
4. **Financeiro** → Registra entradas/saídas, libera saques e bônus
5. **Metas** → Sistema calcula % da meta → libera bônus quando atingida

---

## 5. Stack Recomendada

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 14+ (App Router), React, Tailwind, shadcn/ui |
| Backend | Next.js API Routes + tRPC ou REST |
| Banco | PostgreSQL + Prisma ORM |
| Auth | NextAuth.js (JWT, 2FA) |
| Integrações | Banco Inter API, Airtable API, WhatsApp Business API |

---

## 6. Integrações

- **Airtable** — Base inicial, migrar para PostgreSQL quando > 10k contas
- **Banco Inter** — PIX para pagamentos
- **WhatsApp** — Cotações pré-preenchidas, notificações
- **Make/n8n** — Automações (alertas, bônus)

---

## 7. Segurança

- Login: e-mail + senha, opcional SSO
- 2FA para Admin e Financeiro
- Dados sensíveis criptografados (e-mails, senhas, CNPJs)
- Auditoria de todas as ações
- Permissões granulares por role
