-- Four-eyes review for immutable Calc version lines; never auto-approves.
CREATE TABLE IF NOT EXISTS calculation_line_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calculation_id BIGINT UNSIGNED NOT NULL,
  version_id BIGINT UNSIGNED NOT NULL,
  line_id BIGINT UNSIGNED NOT NULL,
  author_actor_id BIGINT UNSIGNED NOT NULL,
  reviewer_actor_id BIGINT UNSIGNED NOT NULL,
  decision ENUM('approved','rejected') NOT NULL,
  comment TEXT NOT NULL,
  reviewed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calc_line_review_version_line (version_id,line_id),
  KEY idx_calc_line_review_calculation (calculation_id,version_id),
  CONSTRAINT fk_calc_line_review_version FOREIGN KEY (version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_calc_line_review_line FOREIGN KEY (line_id) REFERENCES calculation_lines(id) ON DELETE CASCADE,
  CONSTRAINT fk_calc_line_review_calculation FOREIGN KEY (calculation_id) REFERENCES calculations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
