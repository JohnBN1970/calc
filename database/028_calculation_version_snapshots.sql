CREATE TABLE IF NOT EXISTS calculation_version_snapshots (
  version_id BIGINT UNSIGNED NOT NULL,
  snapshot_contract VARCHAR(64) NOT NULL,
  snapshot_json JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(version_id),
  UNIQUE KEY uq_calculation_snapshot_hash(content_hash),
  CONSTRAINT fk_snapshot_version FOREIGN KEY(version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
