# Arquitetura ERP Ads Ativos

> Revisão estrutural e governança (atualizado)

## 1. Visão Geral

- **Stack:** Next.js 14, Prisma, PostgreSQL, NextAuth
- **Padrão:** API REST, Server Components + Client Components
- **Segurança:** NextAuth JWT, proteção por role em rotas

## 2. Módulos e Responsabilidades

| Módulo | Responsabilidade | APIs principais |
|--------|------------------|-----------------|
| **Produção** | ProductionAccount, aprovação, checklist | `/api/producao`, `/api/producao/[id]/aprovar` |
| **Produção G2** | Produção Google (Gmail + Ads), credenciais | `/api/production-g2`, `/api/production-g2/[id]/*` |
| **Estoque** | StockAccount, reserva/liberação, disponibilidade | `/api/estoque`, `/api/estoque/reservar`, `/api/estoque/liberar` |
| **Base** | Email, CNPJ, Perfil de Pagamento | `/api/base/emails`, `/api/base/cnpjs`, `/api/base/perfis` |
| **Vendas** | Pedidos, cotações | `/api/vendas`, `/api/pedidos` |
| **Entregas** | Delivery, DeliveryGroup, reposições | `/api/entregas`, `/api/entregas-grupos` |
| **Financeiro** | Lançamentos, DRE, projeção | `/api/financeiro` |
| **Metas/Bônus** | Goals, BonusRelease, fechamentos | `/api/metas` |
| **Auditoria** | Logs imutáveis | `/api/admin/auditoria` |

## 3. Fluxos de Status (State Machine)

- **Produção:** PENDING → APPROVED | REJECTED
- **Produção G2:** PARA_CRIACAO → … → EM_REVISAO → APROVADA | REPROVADA → ENVIADA_ESTOQUE
- **Pedido:** AWAITING_PAYMENT → PAID → IN_DELIVERY → DELIVERED
- **Grupo Entrega:** AGUARDANDO_INICIO → EM_ANDAMENTO → FINALIZADA

Transições validadas em `src/lib/state-machine.ts`.

## 4. Permissões (Roles)

| Role | Nível | Acesso |
|------|-------|--------|
| ADMIN | 100 | Total |
| FINANCE | 80 | Financeiro, estoque, aprovações |
| COMMERCIAL | 70 | Vendas, entregas-grupos |
| DELIVERER | 60 | Entregas |
| PRODUCER | 50 | Produção, metas |
| MANAGER | 45 | Gestão de contas |
| PLUG_PLAY | 40 | Operações Black |
| CLIENT | 10 | Portal cliente |

Helper centralizado: `requireAuth()`, `requireRoles()`, `requireMinLevel()` em `src/lib/api-auth.ts`.

## 5. Integridade de Dados

- **Duplicidade:** validação de CNPJ, email, ID Google Ads em Production G2 e base
- **Reutilização:** itens CONSUMED não reutilizáveis
- **Transações:** operações críticas com `prisma.$transaction` quando necessário

## 6. Auditoria

- **AuditLog:** `userId`, `action`, `entity`, `entityId`, `details`, `oldValue`, `newValue`, `ip`
- Logs não editáveis (governança)
- Exportação CSV com valor antigo/novo

## 7. Segurança de Credenciais

- ProductionG2: credenciais mascaradas em respostas; visualização registrada em `ProductionG2CredentialViewLog`
- Email: `passwordPlain` armazenado; uso controlado e mascarado em UIs

## 8. Performance

- Índices em: Notification, ProductionAccount, StockAccount, Order, DeliveryGroup, FinancialEntry, AuditLog, ProductionG2, Withdrawal, Goal, Cnpj, PaymentProfile
- Paginação com `limit` máximo 200 em listagens

## 9. Preparação Internacional

- Multi-moeda em Order, FinancialEntry
- Country, Niche para segmentação
- Currency em ProductionG2

## 10. Changelog de Revisão

- Helper de auth centralizado
- State machine para transições
- Índices adicionais (Cnpj, PaymentProfile, Withdrawal, Goal)
- AuditLog com oldValue/newValue
- Rota Produção G2 no middleware
- Validação reforçada em estoque/reservar
