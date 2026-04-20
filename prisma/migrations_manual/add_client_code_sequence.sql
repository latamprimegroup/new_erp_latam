-- Tabela de sequência para client_code (C001, C288+). Preferir `npx prisma db push` após atualizar schema.prisma.
-- Script opcional (MySQL) para sincronizar last_number com códigos já existentes:

-- CREATE TABLE IF NOT EXISTS client_code_sequence (...); -- gerado pelo Prisma

-- SET @m := (SELECT COALESCE(MAX(CAST(SUBSTRING(client_code, 2) AS UNSIGNED)), 0) FROM ClientProfile WHERE client_code REGEXP '^[Cc][0-9]+$');
-- INSERT INTO client_code_sequence (id, last_number) VALUES (1, @m) ON DUPLICATE KEY UPDATE last_number = GREATEST(last_number, VALUES(last_number));
