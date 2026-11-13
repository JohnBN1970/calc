ALTER TABLE calculation_versions
  ADD COLUMN edit_revision BIGINT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS calculation_change_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calculation_id BIGINT UNSIGNED NOT NULL,
  version_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  event_kind ENUM('draft_saved','version_started','version_established') NOT NULL,
  edit_revision BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  changes_json JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_calc_change_history (calculation_id,id),
  CONSTRAINT fk_calc_change_calculation FOREIGN KEY (calculation_id) REFERENCES calculations(id),
  CONSTRAINT fk_calc_change_version FOREIGN KEY (version_id) REFERENCES calculation_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
