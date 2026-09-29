CREATE TABLE IF NOT EXISTS calculation_production_bundles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bundle_uuid CHAR(36) NOT NULL,
  version_id BIGINT UNSIGNED NOT NULL,
  group_ref VARCHAR(512) NOT NULL,
  label_text VARCHAR(512) NOT NULL,
  production_mode ENUM('workshop','site','either') NOT NULL,
  status ENUM('planned','released','in_production','ready','dispatched','on_site','completed','blocked') NOT NULL DEFAULT 'planned',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_bundle_uuid (bundle_uuid),
  KEY idx_production_bundle_version (version_id),
  KEY idx_production_bundle_status (status),
  CONSTRAINT fk_production_bundle_version FOREIGN KEY (version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
