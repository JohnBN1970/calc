ALTER TABLE calculation_lines
  ADD COLUMN price_source_type ENUM('manual','article','recipe','supplier_quote') NOT NULL DEFAULT 'manual' AFTER other_unit_cost,
  ADD COLUMN office_source_id VARCHAR(128) NULL AFTER price_source_type,
  ADD COLUMN source_reference VARCHAR(255) NULL AFTER office_source_id,
  ADD COLUMN source_supplier VARCHAR(255) NULL AFTER source_reference,
  ADD COLUMN source_unit_price DECIMAL(19,4) NULL AFTER source_supplier,
  ADD COLUMN source_price_date DATE NULL AFTER source_unit_price,
  ADD COLUMN source_document_id VARCHAR(128) NULL AFTER source_price_date;

CREATE INDEX idx_line_price_source
  ON calculation_lines (price_source_type, office_source_id);
