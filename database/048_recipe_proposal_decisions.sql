CREATE TABLE IF NOT EXISTS calc_recipe_proposal_decisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calculation_id BIGINT UNSIGNED NOT NULL,
  position_ref VARCHAR(190) NOT NULL,
  recipe_version_id BIGINT UNSIGNED NOT NULL,
  decision ENUM('accepted','rejected') NOT NULL,
  reason VARCHAR(1000) NULL,
  source_selection_version VARCHAR(190) NULL,
  decided_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calc_recipe_proposal_decision (calculation_id, position_ref, recipe_version_id),
  KEY idx_calc_recipe_proposal_decisions_calc (calculation_id),
  CONSTRAINT fk_recipe_proposal_decision_calculation FOREIGN KEY (calculation_id) REFERENCES calculations(id) ON DELETE CASCADE
);
