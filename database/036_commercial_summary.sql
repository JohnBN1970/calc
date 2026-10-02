ALTER TABLE calculation_versions
  ADD COLUMN vat_rate DECIMAL(10,4) NULL AFTER sales_price;
