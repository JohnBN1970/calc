CREATE TABLE IF NOT EXISTS recipes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_key VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(1000) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_recipe_key (recipe_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipe_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  applicability_json JSON NULL,
  published_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_recipe_version (recipe_id, version_no),
  KEY idx_recipe_version_status (recipe_id, status),
  CONSTRAINT fk_recipe_version_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipe_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_version_id BIGINT UNSIGNED NOT NULL,
  line_ref VARCHAR(191) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  cost_kind ENUM('material','labour','equipment','subcontracting','other') NOT NULL,
  description VARCHAR(255) NOT NULL,
  unit VARCHAR(32) NULL,
  quantity_source_type VARCHAR(64) NULL,
  quantity_source_ref VARCHAR(191) NULL,
  cost_source_type VARCHAR(64) NULL,
  cost_source_ref VARCHAR(191) NULL,
  takeoff_basis ENUM(
    'area',
    'perimeter',
    'two_sides_plus_head',
    'width',
    'height',
    'part_area',
    'internal_joint',
    'fixed'
  ) NOT NULL DEFAULT 'fixed',
  factor DECIMAL(19,8) NOT NULL DEFAULT 1,
  waste_pct DECIMAL(9,4) NOT NULL DEFAULT 0,
  fixed_quantity DECIMAL(19,8) NULL,
  rounding_step DECIMAL(19,8) NULL,
  minimum_quantity DECIMAL(19,8) NULL,
  metadata_json JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_recipe_version_line (recipe_version_id, line_ref),
  KEY idx_recipe_line_quantity_source (quantity_source_type, quantity_source_ref),
  KEY idx_recipe_line_cost_source (cost_source_type, cost_source_ref),
  CONSTRAINT fk_recipe_line_version FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id) ON DELETE CASCADE,
  CONSTRAINT chk_recipe_line_factor CHECK (factor >= 0),
  CONSTRAINT chk_recipe_line_waste CHECK (waste_pct >= 0 AND waste_pct <= 1000),
  CONSTRAINT chk_recipe_line_rounding CHECK (rounding_step IS NULL OR rounding_step > 0),
  CONSTRAINT chk_recipe_line_minimum CHECK (minimum_quantity IS NULL OR minimum_quantity >= 0),
  CONSTRAINT chk_recipe_line_fixed CHECK (fixed_quantity IS NULL OR fixed_quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
