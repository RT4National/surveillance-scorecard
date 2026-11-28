ALTER TABLE publications ADD COLUMN change_reasons TEXT
CHECK (change_reasons IS NULL OR (json_valid(change_reasons) AND json_type(change_reasons) = 'array'));
