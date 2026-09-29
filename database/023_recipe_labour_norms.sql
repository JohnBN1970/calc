CREATE TABLE IF NOT EXISTS recipe_labour_norms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_ref VARCHAR(191) NOT NULL,
  recipe_line_ref VARCHAR(191) NOT NULL,
  role_ref VARCHAR(191) NOT NULL,
  norm_hours_per_unit DECIMAL(19,8) NOT NULL,
  source_ref VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_recipe_labour_norm (recipe_ref, recipe_line_ref),
  KEY idx_recipe_labour_role (role_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
