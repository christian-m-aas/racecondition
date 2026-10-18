-- Run AFTER the site update is deployed (the old admin form still writes this column).
alter table race_results drop column if exists laps_completed;
