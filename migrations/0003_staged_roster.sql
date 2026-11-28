CREATE TABLE staged_roster (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  captured_at TEXT NOT NULL,
  roster TEXT NOT NULL CHECK (json_valid(roster))
);

CREATE TABLE staged_roster_capture (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  captured_at TEXT NOT NULL,
  capture TEXT NOT NULL CHECK (json_valid(capture))
);
