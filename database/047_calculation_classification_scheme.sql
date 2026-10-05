ALTER TABLE calculations
  ADD COLUMN classification_scheme ENUM('nl_sfb','stabu','custom') NOT NULL DEFAULT 'nl_sfb' AFTER status;
