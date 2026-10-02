CREATE TABLE calc_document_triage_decisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calculation_id BIGINT UNSIGNED NOT NULL,
  office_document_id BIGINT UNSIGNED NOT NULL,
  decision ENUM('primary','supporting','review','excluded') NOT NULL,
  reason VARCHAR(500) NULL,
  decided_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calc_document_triage_decision (calculation_id, office_document_id),
  KEY idx_calc_document_triage_calculation (calculation_id),
  CONSTRAINT fk_calc_document_triage_calculation
    FOREIGN KEY (calculation_id) REFERENCES calculations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
