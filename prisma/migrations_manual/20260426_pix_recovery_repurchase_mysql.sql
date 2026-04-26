-- Campos para rastreamento de mensagens automáticas de recuperação e recompra
ALTER TABLE `quick_sale_checkouts`
  ADD COLUMN IF NOT EXISTS `recovery_msg_sent_at`   DATETIME(3) NULL AFTER `referrer`,
  ADD COLUMN IF NOT EXISTS `repurchase_msg_sent_at`  DATETIME(3) NULL AFTER `recovery_msg_sent_at`;

CREATE INDEX IF NOT EXISTS `idx_qsc_recovery_msg_sent_at`
  ON `quick_sale_checkouts` (`recovery_msg_sent_at`);

CREATE INDEX IF NOT EXISTS `idx_qsc_repurchase_msg_sent_at`
  ON `quick_sale_checkouts` (`repurchase_msg_sent_at`);
