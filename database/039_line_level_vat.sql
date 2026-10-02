ALTER TABLE calculation_lines
  ADD COLUMN vat_regime_id BIGINT UNSIGNED NULL AFTER other_unit_cost,
  ADD KEY idx_calculation_line_vat_regime (vat_regime_id),
  ADD CONSTRAINT fk_calculation_line_vat_regime
    FOREIGN KEY (vat_regime_id) REFERENCES calc_vat_regimes(id) ON DELETE SET NULL;

ALTER TABLE calculation_tail_cost_components
  ADD COLUMN vat_regime_id BIGINT UNSIGNED NULL AFTER quantity,
  ADD KEY idx_tail_cost_vat_regime (vat_regime_id),
  ADD CONSTRAINT fk_tail_cost_vat_regime
    FOREIGN KEY (vat_regime_id) REFERENCES calc_vat_regimes(id) ON DELETE SET NULL;

UPDATE calculation_lines l
JOIN calculation_versions v ON v.id=l.version_id
JOIN calc_vat_regimes r ON r.rate=v.vat_rate AND r.treatment='normal'
SET l.vat_regime_id=r.id
WHERE v.vat_rate IS NOT NULL
  AND l.line_type IN ('item','allowance','adjustable','option');

UPDATE calculation_tail_cost_components t
JOIN calculation_versions v ON v.id=t.version_id
JOIN calc_vat_regimes r ON r.rate=v.vat_rate AND r.treatment='normal'
SET t.vat_regime_id=r.id
WHERE v.vat_rate IS NOT NULL;
