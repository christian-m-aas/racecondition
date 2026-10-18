-- Run AFTER the site update is deployed (the old admin form still writes these columns).
alter table crashes drop column if exists turn_name;
alter table crashes drop column if exists lap_number;
