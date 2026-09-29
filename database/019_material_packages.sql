CREATE TABLE IF NOT EXISTS calculation_material_packages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_ref VARCHAR(128) NOT NULL,
  package_description VARCHAR(255) NOT NULL,
  content_per_package DECIMAL(19,6) NOT NULL,
  content_unit VARCHAR(32) NOT NULL,
  package_price DECIMAL(19,4) NOT NULL,
  packages_per_order_unit INT UNSIGNED NOT NULL DEFAULT 1,
  valid_from DATE NULL,
  valid_to DATE NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_material_package_article (article_ref,valid_from,valid_to),
  CONSTRAINT chk_material_package_content CHECK (content_per_package > 0),
  CONSTRAINT chk_material_package_price CHECK (package_price > 0),
  CONSTRAINT chk_material_package_order CHECK (packages_per_order_unit > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
