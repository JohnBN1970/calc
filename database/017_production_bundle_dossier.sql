CREATE TABLE IF NOT EXISTS calculation_production_bundle_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bundle_id BIGINT UNSIGNED NOT NULL,
  item_ref VARCHAR(128) NOT NULL,
  profile_ref VARCHAR(128) NULL,
  piece_length_mm DECIMAL(19,4) NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_bundle_item_ref (bundle_id, item_ref),
  KEY idx_bundle_item_order (bundle_id, sort_order),
  CONSTRAINT fk_bundle_item_bundle FOREIGN KEY (bundle_id) REFERENCES calculation_production_bundles(id) ON DELETE CASCADE,
  CONSTRAINT chk_bundle_item_length CHECK (piece_length_mm IS NULL OR piece_length_mm > 0),
  CONSTRAINT chk_bundle_item_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calculation_production_bundle_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bundle_id BIGINT UNSIGNED NOT NULL,
  link_type ENUM('office_document','drawing','photo','instruction','other') NOT NULL,
  external_ref VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_bundle_link (bundle_id, link_type, external_ref),
  KEY idx_bundle_link_order (bundle_id, sort_order),
  CONSTRAINT fk_bundle_link_bundle FOREIGN KEY (bundle_id) REFERENCES calculation_production_bundles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
