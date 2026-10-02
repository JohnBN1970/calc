CREATE TABLE calc_vat_regimes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  treatment ENUM('normal','reverse_charge','exempt') NOT NULL DEFAULT 'normal',
  rate DECIMAL(10,4) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calc_vat_regime_code (code)
);

CREATE TABLE calculation_vat_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  vat_regime_id BIGINT UNSIGNED NULL,
  regime_code VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  treatment ENUM('normal','reverse_charge','exempt') NOT NULL,
  rate DECIMAL(10,4) NULL,
  taxable_base DECIMAL(18,4) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calc_vat_component_regime (version_id, regime_code),
  KEY idx_calc_vat_component_version (version_id),
  KEY idx_calc_vat_component_regime (vat_regime_id),
  CONSTRAINT fk_calc_vat_component_version
    FOREIGN KEY (version_id) REFERENCES calculation_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_calc_vat_component_regime
    FOREIGN KEY (vat_regime_id) REFERENCES calc_vat_regimes(id) ON DELETE SET NULL
);

INSERT INTO calc_vat_regimes (code,label,treatment,rate,active,sort_order)
SELECT DISTINCT
  CONCAT('legacy_', REPLACE(CAST(vat_rate AS CHAR), '.', '_')),
  CONCAT(CAST(vat_rate AS CHAR), '% btw'),
  'normal',
  vat_rate,
  1,
  0
FROM calculation_versions
WHERE vat_rate IS NOT NULL;

INSERT INTO calculation_vat_components
  (version_id, vat_regime_id, regime_code, label, treatment, rate, taxable_base, vat_amount, sort_order)
SELECT
  v.id,
  r.id,
  r.code,
  r.label,
  r.treatment,
  r.rate,
  COALESCE(v.sales_price, 0),
  COALESCE(v.sales_price, 0) * (COALESCE(r.rate,0) / 100),
  r.sort_order
FROM calculation_versions v
JOIN calc_vat_regimes r ON r.rate = v.vat_rate AND r.treatment='normal'
WHERE v.vat_rate IS NOT NULL;
