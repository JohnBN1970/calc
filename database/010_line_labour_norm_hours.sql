ALTER TABLE calculation_lines
  ADD COLUMN labour_norm DECIMAL(19,4) NULL AFTER quantity,
  ADD COLUMN labour_total_hours DECIMAL(19,4) NULL AFTER labour_norm,
  ADD COLUMN labour_hours_input_mode ENUM('norm','total_hours') NULL AFTER labour_total_hours;
