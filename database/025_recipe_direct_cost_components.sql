CREATE TABLE IF NOT EXISTS recipe_direct_cost_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_ref VARCHAR(191) NOT NULL,
  recipe_line_ref VARCHAR(191) NOT NULL,
  cost_kind ENUM('equipment','subcontract','other') NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  source_ref VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_recipe_direct_cost_line (recipe_ref, recipe_line_ref, active),
  KEY idx_recipe_direct_cost_kind (cost_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
