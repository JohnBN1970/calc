CREATE TABLE IF NOT EXISTS calculations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  office_project_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status ENUM('draft','established','archived') NOT NULL DEFAULT 'draft',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calculation_code (code),
  KEY idx_calculation_office_project (office_project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calculation_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calculation_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  status ENUM('draft','established') NOT NULL DEFAULT 'draft',
  direct_cost DECIMAL(19,4) NOT NULL DEFAULT 0,
  markup_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
  sales_price DECIMAL(19,4) NOT NULL DEFAULT 0,
  content_hash CHAR(64) NULL,
  established_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calculation_version (calculation_id, version_no),
  CONSTRAINT fk_version_calculation FOREIGN KEY (calculation_id) REFERENCES calculations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calculation_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  line_type ENUM('chapter','paragraph','item','allowance','adjustable','option','note') NOT NULL,
  code VARCHAR(64) NULL,
  description VARCHAR(500) NOT NULL,
  unit VARCHAR(32) NULL,
  quantity DECIMAL(19,4) NULL,
  labour_unit_cost DECIMAL(19,4) NOT NULL DEFAULT 0,
  material_unit_cost DECIMAL(19,4) NOT NULL DEFAULT 0,
  equipment_unit_cost DECIMAL(19,4) NOT NULL DEFAULT 0,
  subcontracting_unit_cost DECIMAL(19,4) NOT NULL DEFAULT 0,
  other_unit_cost DECIMAL(19,4) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_line_version_sort (version_id, sort_order),
  KEY idx_line_parent (parent_id),
  CONSTRAINT fk_line_version FOREIGN KEY (version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_line_parent FOREIGN KEY (parent_id) REFERENCES calculation_lines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
