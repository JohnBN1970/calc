ALTER TABLE calculation_production_bundles
  MODIFY COLUMN status ENUM('planned','released') NOT NULL DEFAULT 'planned';

ALTER TABLE calculation_production_bundles
  CHANGE COLUMN bundle_uuid handoff_uuid CHAR(36) NOT NULL,
  CHANGE COLUMN label_text handoff_label VARCHAR(512) NOT NULL;

ALTER TABLE calculation_production_bundles
  RENAME TO calculation_execution_handoffs;
