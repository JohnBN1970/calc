ALTER TABLE calculation_lines
  ADD COLUMN labour_role_ref VARCHAR(191) NULL AFTER labour_hours_input_mode,
  ADD COLUMN labour_rate_id BIGINT UNSIGNED NULL AFTER labour_role_ref,
  ADD KEY idx_line_labour_role (labour_role_ref),
  ADD KEY idx_line_labour_rate (labour_rate_id);
