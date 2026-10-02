CREATE TABLE calculation_vat_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  regime_code VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  rate DECIMAL(10,4) NULL,
  taxable_base DECIMAL(18,4) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  reverse_charged TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calc_vat_component_regime (version_id, regime_code),
  KEY idx_calc_vat_component_version (version_id),
  CONSTRAINT fk_calc_vat_component_version
    FOREIGN KEY (version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE
);

INSERT INTO calculation_vat_components
  (version_id, regime_code, label, rate, taxable_base, vat_amount, reverse_charged, sort_order)
SELECT
  id,
  CONCAT('rate_', REPLACE(CAST(vat_rate AS CHAR), '.', '_')),
  CONCAT(CAST(vat_rate AS CHAR), '% btw'),
  vat_rate,
  COALESCE(sales_price, 0),
  COALESCE(sales_price, 0) * (vat_rate / 100),
  0,
  0
FROM calculation_versions
WHERE vat_rate IS NOT NULL;
