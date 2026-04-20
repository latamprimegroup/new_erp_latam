-- Ads Tracker M12–M14: anti-spy (shield), Safe Browsing monitor, LTV por identidade (MySQL 8+)

ALTER TABLE `traffic_shield_settings`
  ADD COLUMN `enable_spy_tool_blocking` TINYINT(1) NOT NULL DEFAULT 1 AFTER `push_environment_hints`;

CREATE TABLE `traffic_shield_spy_blocks` (
  `id` VARCHAR(191) NOT NULL,
  `kind` ENUM('IP_CIDR', 'USER_AGENT_SUBSTRING') NOT NULL,
  `pattern` VARCHAR(500) NOT NULL,
  `note` VARCHAR(200) NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `traffic_shield_spy_blocks_active_kind_idx` (`active`, `kind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_domain_reputation_checks` (
  `id` VARCHAR(191) NOT NULL,
  `domain_host` VARCHAR(253) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `detail` VARCHAR(500) NULL,
  `panic_triggered` TINYINT(1) NOT NULL DEFAULT 0,
  `checked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `tracker_domain_reputation_checks_domain_host_checked_at_idx` (`domain_host`, `checked_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_lead_ltv_aggregates` (
  `id` VARCHAR(191) NOT NULL,
  `buyer_identity_hash` CHAR(64) NOT NULL,
  `buyer_hint` VARCHAR(48) NOT NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'BRL',
  `total_gross` DECIMAL(14,2) NOT NULL,
  `purchase_count` INT NOT NULL,
  `attributed_campaign_id` VARCHAR(64) NULL,
  `attributed_offer_id` VARCHAR(64) NULL,
  `first_purchase_at` DATETIME(3) NOT NULL,
  `last_purchase_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE KEY `tracker_lead_ltv_aggregates_buyer_identity_hash_key` (`buyer_identity_hash`),
  KEY `tracker_lead_ltv_aggregates_attributed_campaign_id_idx` (`attributed_campaign_id`),
  KEY `tracker_lead_ltv_aggregates_total_gross_idx` (`total_gross`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tracker_lead_ltv_purchases` (
  `id` VARCHAR(191) NOT NULL,
  `buyer_identity_hash` CHAR(64) NOT NULL,
  `buyer_hint` VARCHAR(48) NOT NULL,
  `offer_id` VARCHAR(64) NOT NULL,
  `platform_order_id` VARCHAR(200) NULL,
  `amount_gross` DECIMAL(14,2) NOT NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'BRL',
  `sale_signal_id` VARCHAR(64) NOT NULL,
  `attributed_campaign_id` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tracker_lead_ltv_purchases_sale_signal_id_key` (`sale_signal_id`),
  KEY `tracker_lead_ltv_purchases_buyer_identity_hash_idx` (`buyer_identity_hash`),
  KEY `tracker_lead_ltv_purchases_offer_id_idx` (`offer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
