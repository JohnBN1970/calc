ALTER TABLE labour_cost_rates
  ADD COLUMN label VARCHAR(191) NULL AFTER role_ref,
  ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 AFTER active,
  ADD KEY idx_labour_cost_rate_default (role_ref, is_default, active);
