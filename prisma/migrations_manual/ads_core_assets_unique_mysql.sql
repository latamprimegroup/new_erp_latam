-- Última linha de defesa: unicidade de CNPJ e site (alinhado ao Prisma @unique).
-- Execute apenas se a tabela existir sem estes índices.

-- ALTER TABLE `ads_core_assets` ADD UNIQUE INDEX `ads_core_assets_cnpj_key` (`cnpj`);
-- ALTER TABLE `ads_core_assets` ADD UNIQUE INDEX `ads_core_assets_site_url_key` (`site_url`);
