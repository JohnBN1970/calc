CREATE TABLE IF NOT EXISTS calculation_material_consumption_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipe_ref VARCHAR(128) NOT NULL,
  recipe_line_ref VARCHAR(128) NOT NULL,
  article_ref VARCHAR(128) NULL,
  conversion_kind ENUM('direct','paint_liter','linear_roll','sheet_by_area','piece') NOT NULL DEFAULT 'direct',
  coats DECIMAL(9,4) NULL,
  coverage_m2_per_liter DECIMAL(19,6) NULL,
  sheet_width_mm DECIMAL(19,4) NULL,
  sheet_height_mm DECIMAL(19,4) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_consumption_recipe (recipe_ref,recipe_line_ref),
  KEY idx_consumption_article (article_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
