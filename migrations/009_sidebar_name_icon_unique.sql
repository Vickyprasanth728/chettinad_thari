-- Enforce unique sidebar name and icon (path already unique via uk_sidebar_path)
ALTER TABLE sidebar ADD UNIQUE KEY uk_sidebar_name (name);
ALTER TABLE sidebar ADD UNIQUE KEY uk_sidebar_icon (icon);
