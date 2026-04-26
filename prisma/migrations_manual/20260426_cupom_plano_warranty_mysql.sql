-- Cupom de desconto: novos campos (expiração, limite de uso, valor fixo, listing específico)
ALTER TABLE `commercial_coupons`
  ADD COLUMN IF NOT EXISTS `amount_off`    DECIMAL(10,2)  NULL   AFTER `percent_off`,
  ADD COLUMN IF NOT EXISTS `expires_at`    DATETIME(3)    NULL   AFTER `description`,
  ADD COLUMN IF NOT EXISTS `usage_limit`   INT            NULL   AFTER `expires_at`,
  ADD COLUMN IF NOT EXISTS `usage_count`   INT            NOT NULL DEFAULT 0 AFTER `usage_limit`,
  ADD COLUMN IF NOT EXISTS `listing_id`    VARCHAR(30)    NULL   AFTER `usage_count`;

CREATE INDEX IF NOT EXISTS `idx_cc_expires_at`  ON `commercial_coupons` (`expires_at`);
CREATE INDEX IF NOT EXISTS `idx_cc_code_active` ON `commercial_coupons` (`code`, `active`);

-- QuickSaleCheckout: cupom aplicado + alerta de garantia
ALTER TABLE `quick_sale_checkouts`
  ADD COLUMN IF NOT EXISTS `coupon_code`          VARCHAR(40)   NULL AFTER `referrer`,
  ADD COLUMN IF NOT EXISTS `coupon_discount`       DECIMAL(10,2) NULL AFTER `coupon_code`,
  ADD COLUMN IF NOT EXISTS `warranty_alert_sent_at` DATETIME(3)  NULL AFTER `repurchase_msg_sent_at`;

CREATE INDEX IF NOT EXISTS `idx_qsc_warranty_alert` ON `quick_sale_checkouts` (`warranty_alert_sent_at`);
