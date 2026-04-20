-- Patentes / gamificação — cache no perfil + endereço no resgate
ALTER TABLE `client_profiles`
  ADD COLUMN `gamification_rank_cached` VARCHAR(32) NULL,
  ADD COLUMN `gamification_total_net_profit_brl` DECIMAL(14, 2) NULL,
  ADD COLUMN `gamification_last_celebrated_rank` VARCHAR(32) NULL;

ALTER TABLE `client_gamification_redemptions`
  ADD COLUMN `shipping_payload` JSON NULL;
