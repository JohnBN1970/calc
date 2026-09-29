CREATE TABLE IF NOT EXISTS labour_cost_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_ref VARCHAR(191) NOT NULL,
  hourly_cost_rate DECIMAL(19,4) NOT NULL,
  source_ref VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  valid_from DATE NULL,
  valid_to DATE NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_labour_cost_rate_role (role_ref),
  KEY idx_labour_cost_rate_validity (role_ref, valid_from, valid_to, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
