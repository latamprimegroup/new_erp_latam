-- Fornecedores: CPF/CNPJ + PIX (cifrado na app via encryption.ts).
-- MySQL — ignore erro se as colunas já existirem.
ALTER TABLE Supplier ADD COLUMN tax_id VARCHAR(32) NULL;
ALTER TABLE Supplier ADD COLUMN pix_key_encrypted TEXT NULL;
