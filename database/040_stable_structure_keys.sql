ALTER TABLE calculation_lines
  ADD COLUMN structure_key CHAR(36) NULL AFTER parent_id,
  ADD UNIQUE KEY uq_calculation_line_structure_key (version_id, structure_key);

UPDATE calculation_lines
   SET structure_key = UUID()
 WHERE structure_key IS NULL;
