ALTER TABLE calculation_tail_cost_components
  ADD COLUMN owner_type ENUM('calculation','subcalculation') NOT NULL DEFAULT 'calculation' AFTER version_id,
  ADD COLUMN owner_ref VARCHAR(191) NULL AFTER owner_type,
  ADD KEY idx_tail_component_owner(version_id,owner_type,owner_ref);

UPDATE calculation_tail_cost_components
   SET owner_type='calculation', owner_ref=NULL
 WHERE owner_type='calculation';
