ALTER TABLE calculation_tail_cost_components
  MODIFY COLUMN base_scope ENUM(
    'direct_cost',
    'running_total',
    'selected_lines',
    'subcalculation',
    'quantity',
    'owner_direct_cost',
    'owner_running_total',
    'consolidated_direct_cost',
    'consolidated_running_total'
  ) NOT NULL DEFAULT 'owner_direct_cost';

UPDATE calculation_tail_cost_components
   SET base_scope='owner_direct_cost'
 WHERE base_scope='direct_cost';

UPDATE calculation_tail_cost_components
   SET base_scope='owner_running_total'
 WHERE base_scope='running_total';
