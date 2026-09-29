CREATE TABLE IF NOT EXISTS calculation_geometry_parts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  geometry_id BIGINT UNSIGNED NOT NULL,
  part_ref VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  x_mm DECIMAL(19,4) NOT NULL DEFAULT 0,
  y_mm DECIMAL(19,4) NOT NULL DEFAULT 0,
  width_mm DECIMAL(19,4) NOT NULL,
  height_mm DECIMAL(19,4) NOT NULL,
  quantity DECIMAL(19,4) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_geometry_part_ref (geometry_id, part_ref),
  KEY idx_geometry_parts_geometry (geometry_id),
  CONSTRAINT fk_geometry_parts_geometry FOREIGN KEY (geometry_id) REFERENCES calculation_line_geometry(id) ON DELETE CASCADE,
  CONSTRAINT chk_geometry_part_width CHECK (width_mm > 0),
  CONSTRAINT chk_geometry_part_height CHECK (height_mm > 0),
  CONSTRAINT chk_geometry_part_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calculation_geometry_joints (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  geometry_id BIGINT UNSIGNED NOT NULL,
  joint_ref VARCHAR(128) NOT NULL,
  part_a_id BIGINT UNSIGNED NULL,
  part_b_id BIGINT UNSIGNED NULL,
  orientation ENUM('horizontal','vertical','diagonal','other') NOT NULL DEFAULT 'other',
  length_mm DECIMAL(19,4) NOT NULL,
  quantity DECIMAL(19,4) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_geometry_joint_ref (geometry_id, joint_ref),
  KEY idx_geometry_joints_geometry (geometry_id),
  CONSTRAINT fk_geometry_joints_geometry FOREIGN KEY (geometry_id) REFERENCES calculation_line_geometry(id) ON DELETE CASCADE,
  CONSTRAINT fk_geometry_joints_part_a FOREIGN KEY (part_a_id) REFERENCES calculation_geometry_parts(id) ON DELETE SET NULL,
  CONSTRAINT fk_geometry_joints_part_b FOREIGN KEY (part_b_id) REFERENCES calculation_geometry_parts(id) ON DELETE SET NULL,
  CONSTRAINT chk_geometry_joint_length CHECK (length_mm > 0),
  CONSTRAINT chk_geometry_joint_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
