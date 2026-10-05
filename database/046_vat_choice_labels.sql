UPDATE calc_vat_regimes
SET label='Hoog'
WHERE treatment='normal'
  AND ABS(COALESCE(rate,0)-21)<0.0001
  AND LOWER(REPLACE(label,' ','')) IN ('21%btw','21%','btw21%');

UPDATE calc_vat_regimes
SET label='Laag'
WHERE treatment='normal'
  AND ABS(COALESCE(rate,0)-9)<0.0001
  AND LOWER(REPLACE(label,' ','')) IN ('9%btw','9%','btw9%');
