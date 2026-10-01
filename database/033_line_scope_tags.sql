CREATE TABLE IF NOT EXISTS calculation_line_scope_tags (
  line_id BIGINT UNSIGNED NOT NULL,
  scope_type ENUM(
    'building','facade','dwelling','dwelling_type','building_part',
    'position','structure','recipe','custom'
  ) NOT NULL,
  scope_ref VARCHAR(191) NOT NULL,
  source ENUM('generated','manual','office_context') NOT NULL DEFAULT 'generated',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(line_id,scope_type,scope_ref),
  KEY idx_line_scope_lookup(scope_type,scope_ref,line_id),
  CONSTRAINT fk_line_scope_line FOREIGN KEY(line_id) REFERENCES calculation_lines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
