ALTER TABLE calculation_versions
  ADD COLUMN source_office_version VARCHAR(128) NULL AFTER sales_price,
  ADD COLUMN source_selection_version VARCHAR(128) NULL AFTER source_office_version,
  ADD COLUMN source_bound_at DATETIME(6) NULL AFTER source_selection_version;
