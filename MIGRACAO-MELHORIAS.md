# Migração após implementação das melhorias

As melhorias do wireframe adicionaram novos campos e tabelas. Para aplicar no banco:

```bash
cd erp-ads-ativos
npm run db:generate
npm run db:push
```

Se preferir usar migrações nomeadas:

```bash
npx prisma migrate dev --name melhorias_wireframe
```

## Novos modelos / campos

- **ProductionAccount**: `rejectionReason`, `stockAccountId`, `updatedAt`
- **StockAccount**: `supplierId`, relação com `ProductionAccount`
- **Supplier**: novo modelo (fornecedores)
- **Order**: `pixQrCode`, `paymentDueAt`, status `QUOTE`, `AWAITING_PAYMENT`, `IN_SEPARATION`, `CANCELLED`
- **FinancialCategory**: novo modelo (categorias financeiras)
- **FinancialEntry**: `categoryId`, `reconciled`
- **Withdrawal**: `holdReason`, `reconciled`
- **ClientProfile**: `notifyEmail`, `notifyWhatsapp`
- **PasswordResetToken**: novo modelo
- **Notification**: novo modelo

## Seed

O seed atual não cria gestores nem popula categorias financeiras. Após o `db:push`, você pode criar fornecedores e categorias pela interface (Admin > Fornecedores; Financeiro usa categoria em texto livre por enquanto). Para criar um usuário Gestor manualmente no Prisma Studio:

```bash
npx prisma studio
```

Crie um User com `role: MANAGER` e em seguida um `ManagerProfile` com o `userId` correspondente.
