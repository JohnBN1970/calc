ALTER TABLE calculation_version_snapshots
  ADD COLUMN snapshot_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER snapshot_contract;

CREATE TABLE IF NOT EXISTS calculation_snapshot_structure_bindings (
  version_id BIGINT UNSIGNED NOT NULL,
  recipe_ref VARCHAR(191) NOT NULL,
  recipe_line_ref VARCHAR(191) NOT NULL,
  structure_ref VARCHAR(191) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(version_id,recipe_ref,recipe_line_ref),
  KEY idx_snapshot_structure_ref(version_id,structure_ref),
  CONSTRAINT fk_snapshot_binding_version FOREIGN KEY(version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
