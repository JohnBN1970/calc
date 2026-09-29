CREATE TABLE IF NOT EXISTS calculation_sales_price_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  component_kind ENUM('general_costs','risk','profit','other') NOT NULL,
  description VARCHAR(255) NOT NULL,
  calculation_mode ENUM('percentage','amount') NOT NULL,
  component_value DECIMAL(19,8) NOT NULL,
  source_ref VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY(id),
  KEY idx_sales_price_components(version_id,sort_order),
  CONSTRAINT fk_sales_price_component_version FOREIGN KEY(version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
