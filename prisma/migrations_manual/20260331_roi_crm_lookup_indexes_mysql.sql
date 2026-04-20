-- Índices para cruzamento TinTim ↔ ERP (telefone / WhatsApp).
-- O schema Prisma já declara @@index([phone]) em User e @@index([whatsapp]) em ClientProfile;
-- ao rodar `npx prisma migrate dev` / `db push`, estes índices são criados automaticamente.
-- Use este ficheiro apenas se aplicar DDL manualmente (ignorar erro "Duplicate key name" se já existir).

CREATE INDEX `users_phone_idx` ON `users` (`phone`);
CREATE INDEX `client_profiles_whatsapp_idx` ON `client_profiles` (`whatsapp`);
