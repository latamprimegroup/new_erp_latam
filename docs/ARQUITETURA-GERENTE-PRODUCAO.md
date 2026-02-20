# Arquitetura: Gerente de Produção e Conferência Diária

> Documento de design como Arquiteto de Software Sênior para ERP de alta escala

## 1. Contexto de Negócio

O time de produção recebe por **conta validada**. Para garantir integridade e conformidade, é necessária uma etapa de **conferência** por um **Gerente de Produção** independente, que:

- Revisa as contas aprovadas pelo fluxo financeiro no dia
- Assina o fechamento diário com sua **senha** (não delegável)
- Garante que apenas contas conferidas entrem na base de pagamento

## 2. Fluxo Proposto

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│ Produtor        │     │ Finance/Admin    │     │ Gerente de Produção     │
│ cria conta      │────▶│ aprova           │────▶│ confere + assina c/senha│
│                 │     │ (APROVADA)       │     │ (validatedAt preenchido)│
└─────────────────┘     └──────────────────┘     └─────────────────────────┘
                                                              │
                                                              ▼
                                               ┌─────────────────────────────┐
                                               │ Conta conta para metas e    │
                                               │ pagamento do produtor       │
                                               └─────────────────────────────┘
```

**Regra de ouro:** Apenas contas com `validatedAt` preenchido entram em:
- `Goal.productionCurrent`
- `ProducerMonthlyStatement.accountsApproved`
- Dashboards de produção validada

## 3. Modelo de Dados

### Novos campos (ProductionAccount e ProductionG2)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `validatedByManagerId` | String? (FK User) | ID do gerente que conferiu |
| `validatedAt` | DateTime? | Momento da conferência |

### Nova Role

| Role | Nível | Responsabilidade |
|------|-------|------------------|
| **PRODUCTION_MANAGER** | 55 | Conferência diária, validação com senha, fechamento de produção |

Posicionada entre PRODUCER (50) e DELIVERER (60).

## 4. APIs

### GET /api/producao/conferencia-diaria
- **Auth:** PRODUCTION_MANAGER, ADMIN
- **Query:** `date` (opcional, default: hoje)
- **Retorno:** Lista de contas APROVADAS/APROVADA+ENVIADA_ESTOQUE **sem** `validatedAt`, agrupadas por produtor
- **Uso:** Tela de conferência do gerente

### POST /api/producao/conferencia-diaria/validar
- **Auth:** PRODUCTION_MANAGER, ADMIN
- **Body:** `{ password: string, productionAccountIds?: string[], productionG2Ids?: string[] }`
- **Validação:** Verifica senha do usuário via `bcrypt.compare(password, user.passwordHash)`
- **Efeito:** Atualiza `validatedByManagerId` e `validatedAt` em lote (transação)
- **Auditoria:** AuditLog com action `production_validated_by_manager`

## 5. Segurança e Auditoria

- **Re-autenticação:** Operação sensível exige confirmação da senha (não basta sessão)
- **Auditoria:** `AuditLog` registra quem validou, quando, e quais IDs
- **Imutabilidade:** `validatedAt` não pode ser desfeito por API comum (apenas admin em caso de erro comprovado)

## 6. Impacto em Módulos Existentes

| Módulo | Alteração |
|--------|-----------|
| metas | Contar apenas contas com `validatedAt` |
| production-payment | `closeMonthForProducer` usa contas validadas |
| dashboard/producao | KPIs de "conferidas" vs "pendentes conferência" |
| dashboard/production-g2 | Idem |

## 7. UI do Gerente de Produção

- **Rota:** `/dashboard/producao/conferencia`
- **Conteúdo:**
  - Data selecionável
  - Tabela: produtor, tipo (Account/G2), código, status, ações
  - Botão "Conferir selecionadas" → modal de senha → POST validar
  - Resumo: X pendentes, Y conferidas no dia

## 8. Migração e Retrocompatibilidade

Contas aprovadas **antes** do deploy não terão `validatedAt`. Para considerar como validadas:

```sql
-- ProductionAccount: definir validatedAt = updatedAt para contas APPROVED sem validatedAt
UPDATE production_account
SET validated_by_manager_id = (SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1),
    validated_at = updated_at
WHERE status = 'APPROVED' AND validated_at IS NULL;

-- ProductionG2: definir validatedAt = approved_at para APROVADA/ENVIADA_ESTOQUE
UPDATE production_g2
SET validated_by_manager_id = (SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1),
    validated_at = COALESCE(approved_at, sent_to_stock_at, created_at)
WHERE status IN ('APROVADA', 'ENVIADA_ESTOQUE')
  AND archived_at IS NULL
  AND validated_at IS NULL;
```

Ou use o script `prisma/scripts/migrate-validated.ts` se disponível.
