# Core Architecture - ERP Ads Ativos

Fundação técnica: Clean Architecture + DDD + Multi-tenancy.

## Estrutura de Pastas

```
src/
├── core/           # Compartilhado
│   ├── domain/     # Base Entity, Result Pattern
│   ├── events/     # Event Bus (Domain Events)
│   └── tenant/     # Context, API handler
├── modules/        # Lógica de negócio (DDD)
└── infra/          # Drivers, DB
    └── db/         # Transações ACID
```

## Base Entity

Todas as entidades de domínio devem estender:

- `id` (string – migrar para UUID v7)
- `tenantId` (string)
- `createdAt`, `updatedAt`
- `version` (Optimistic Locking)
- `deletedAt` (Soft Delete)

## Result Pattern

Retornos padronizados sem exceções genéricas:

```ts
const result: Result<User, string> = ok(user)
if (result.isOk()) {
  console.log(result.value)
} else {
  console.log(result.error)
}
```

## Event Bus

Domain Events para desacoplamento:

```ts
import { publish, subscribe } from '@/core/events/event-bus'

subscribe('VendaEmitida', async (e) => {
  await baixarEstoque(e.payload.orderId)
})

await publish({
  type: 'VendaEmitida',
  payload: { orderId: 'x' },
  occurredAt: new Date(),
})
```

## Multi-tenancy

- Header: `X-Tenant-Id` (default: `ads-ativos`)
- Context: `runWithTenant()`, `getTenantId()`
- API: `withTenant(handler)` em rotas
- Tenant model em `prisma/schema.prisma`

## Transações

```ts
import { withTransaction } from '@/infra/db/transaction'

await withTransaction(async (tx) => {
  await tx.order.create({ ... })
  await tx.stockAccount.update({ ... })
})
```
