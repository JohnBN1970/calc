CREATE TABLE IF NOT EXISTS calculation_line_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  source_line_id BIGINT UNSIGNED NOT NULL,
  target_line_id BIGINT UNSIGNED NOT NULL,
  allocation_method ENUM('quantity','value','manual') NOT NULL,
  share DECIMAL(19,8) NOT NULL DEFAULT 0,
  amount DECIMAL(19,4) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_line_allocation (version_id, source_line_id, target_line_id),
  KEY idx_allocation_source (source_line_id),
  KEY idx_allocation_target (target_line_id),
  CONSTRAINT fk_allocation_version FOREIGN KEY (version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_allocation_source FOREIGN KEY (source_line_id) REFERENCES calculation_lines(id) ON DELETE CASCADE,
  CONSTRAINT fk_allocation_target FOREIGN KEY (target_line_id) REFERENCES calculation_lines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
