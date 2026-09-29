ALTER TABLE calculation_material_packages
  ADD COLUMN supplier_ref VARCHAR(128) NULL AFTER article_ref,
  ADD COLUMN source_ref VARCHAR(255) NULL AFTER packages_per_order_unit,
  ADD KEY idx_material_package_supplier (supplier_ref);
