-- Persist Mottaro virtual browse path when primary category labels are cleared.
ALTER TABLE website_stock ADD COLUMN IF NOT EXISTS mottaro_path text;
ALTER TABLE archived_products ADD COLUMN IF NOT EXISTS mottaro_path text;
