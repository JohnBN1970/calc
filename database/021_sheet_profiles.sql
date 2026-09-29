CREATE TABLE IF NOT EXISTS calculation_sheet_profiles (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 article_ref VARCHAR(128) NOT NULL,
 sheet_width_mm DECIMAL(19,4) NOT NULL,
 sheet_height_mm DECIMAL(19,4) NOT NULL,
 kerf_mm DECIMAL(9,4) NOT NULL DEFAULT 3,
 edge_trim_mm DECIMAL(9,4) NOT NULL DEFAULT 0,
 allow_rotation TINYINT(1) NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id),
 KEY idx_sheet_profile_article(article_ref),
 CONSTRAINT chk_sheet_profile_size CHECK(sheet_width_mm>0 AND sheet_height_mm>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
