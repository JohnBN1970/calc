DROP TABLE IF EXISTS calculation_vat_components;

ALTER TABLE calculation_versions
  DROP COLUMN vat_rate;
