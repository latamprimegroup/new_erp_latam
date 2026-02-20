# Changelog - Revisão e Otimização ERP Ads Ativos

## Resumo

Revisão estrutural com foco em escalabilidade, segurança, integridade e governança.

---

## 1. Integridade de Dados

### State Machine (`src/lib/state-machine.ts`)

- Transições de status validadas para:
  - ProductionAccount
  - ProductionG2
  - Order
  - DeliveryGroup
  - Reposition
- Função `validateTransition()` reutilizável
- Production G2 PATCH valida transições antes de atualizar

### Validações

- Estoque reservar/liberar: validação de `tipo` e `id` com tipos permitidos
- Redução de inputs inválidos e erros em runtime

---

## 2. Segurança

### Mascaramento de Credenciais

- **Email (base):** `passwordPlain` e `passwordHash` mascarados em respostas GET
- **Production G2:** credenciais já mascaradas; visualização com log em `ProductionG2CredentialViewLog`

### Auditoria Enterprise

- **AuditLog:** campos `oldValue` e `newValue` para rastrear alterações
- Export CSV com valor antigo e novo
- Índice `[entity, entityId]` para consultas por entidade

### Permissões

- Helper centralizado `src/lib/api-auth.ts`:
  - `requireAuth()`
  - `requireRoles(allowedRoles)`
  - `requireMinLevel(level)`
  - `ROLE_LEVELS` para hierarquia
- Middleware: rota Produção G2 protegida por role

---

## 3. Performance

### Índices Adicionais (Prisma)

| Modelo | Índices |
|--------|---------|
| Email | `[assignedToProducerId]` |
| Cnpj | `[status, countryId]`, `[assignedToProducerId]` |
| PaymentProfile | `[status, countryId]`, `[assignedToProducerId]` |
| Withdrawal | `[userId]`, `[status]`, `[createdAt]` |
| Goal | `[userId, periodStart]`, `[status]` |
| AuditLog | `[entity, entityId]`, campos `oldValue`, `newValue` |

---

## 4. Modularização

- **api-auth:** autenticação e permissões centralizadas
- **state-machine:** regras de transição de status
- **audit:** parâmetros `oldValue` e `newValue`
- **ARCHITECTURE.md:** visão da arquitetura e governança

---

## 5. Compatibilidade

- Alterações retrocompatíveis
- Novos campos em AuditLog opcionais
- Após deploy: `npx prisma db push`

---

## 6. Melhorias Aplicadas (atualização)

- [x] Migrar rotas para `requireRoles()` em vez de checagem manual
  - Production G2, estoque, producao, admin/auditoria, base/emails
- [x] Criptografia para `Email.passwordPlain` em repouso
  - `src/lib/encryption.ts` (AES-256-GCM); definir `ENCRYPTION_KEY` (32 bytes hex)
- [x] Transações explícitas em operações multi-tabela críticas
  - Production G2 POST, send-to-stock, producao aprovar
- [x] Rate limiting em credenciais G2 (10/min), estoque reservar/liberar (30/min)
- [ ] Implementar cache para dashboards (ex.: Redis)
- [ ] Testes de integração para fluxos críticos
