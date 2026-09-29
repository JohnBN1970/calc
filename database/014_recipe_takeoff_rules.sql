CREATE TABLE IF NOT EXISTS calculation_recipe_takeoff_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_ref VARCHAR(128) NOT NULL,
  line_ref VARCHAR(128) NOT NULL,
  takeoff_basis ENUM(
    'area',
    'perimeter',
    'two_sides_plus_head',
    'width',
    'height',
    'part_area',
    'internal_joint'
  ) NOT NULL,
  factor DECIMAL(19,6) NOT NULL DEFAULT 1,
  waste_pct DECIMAL(9,4) NOT NULL DEFAULT 0,
  output_unit VARCHAR(32) NOT NULL,
  rounding_step DECIMAL(19,6) NULL,
  minimum_quantity DECIMAL(19,6) NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_recipe_takeoff_rule (recipe_ref, line_ref),
  KEY idx_recipe_takeoff_recipe (recipe_ref),
  CONSTRAINT chk_recipe_takeoff_factor CHECK (factor >= 0),
  CONSTRAINT chk_recipe_takeoff_waste CHECK (waste_pct >= 0 AND waste_pct <= 1000),
  CONSTRAINT chk_recipe_takeoff_rounding CHECK (rounding_step IS NULL OR rounding_step > 0),
  CONSTRAINT chk_recipe_takeoff_minimum CHECK (minimum_quantity IS NULL OR minimum_quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
