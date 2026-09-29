CREATE TABLE IF NOT EXISTS calculation_subcalculations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  ref VARCHAR(191) NOT NULL,
  description VARCHAR(255) NOT NULL,
  dimension_type ENUM('building','facade','dwelling_type','building_part','custom') NOT NULL DEFAULT 'custom',
  dimension_ref VARCHAR(191) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY(id),
  UNIQUE KEY uq_subcalculation_ref(version_id,ref),
  KEY idx_subcalculation_sort(version_id,sort_order),
  CONSTRAINT fk_subcalculation_version FOREIGN KEY(version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE calculation_lines
  ADD COLUMN subcalculation_id BIGINT UNSIGNED NULL AFTER version_id,
  ADD KEY idx_line_subcalculation(subcalculation_id),
  ADD CONSTRAINT fk_line_subcalculation FOREIGN KEY(subcalculation_id) REFERENCES calculation_subcalculations(id) ON DELETE SET NULL;
