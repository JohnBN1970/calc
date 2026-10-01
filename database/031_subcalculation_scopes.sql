CREATE TABLE IF NOT EXISTS calculation_subcalculation_scopes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subcalculation_id BIGINT UNSIGNED NOT NULL,
  scope_type ENUM(
    'building',
    'facade',
    'dwelling',
    'dwelling_type',
    'building_part',
    'position',
    'structure',
    'recipe',
    'custom'
  ) NOT NULL,
  scope_ref VARCHAR(191) NOT NULL,
  include_descendants TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(id),
  UNIQUE KEY uq_subcalculation_scope(subcalculation_id,scope_type,scope_ref),
  KEY idx_subcalculation_scope_lookup(scope_type,scope_ref),
  CONSTRAINT fk_subcalculation_scope_sub FOREIGN KEY(subcalculation_id) REFERENCES calculation_subcalculations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calculation_subcalculation_line_memberships (
  subcalculation_id BIGINT UNSIGNED NOT NULL,
  calculation_line_id BIGINT UNSIGNED NOT NULL,
  membership_source ENUM('scope','manual') NOT NULL DEFAULT 'scope',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(subcalculation_id,calculation_line_id),
  KEY idx_subcalc_membership_line(calculation_line_id),
  CONSTRAINT fk_subcalc_membership_sub FOREIGN KEY(subcalculation_id) REFERENCES calculation_subcalculations(id) ON DELETE CASCADE,
  CONSTRAINT fk_subcalc_membership_line FOREIGN KEY(calculation_line_id) REFERENCES calculation_lines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
