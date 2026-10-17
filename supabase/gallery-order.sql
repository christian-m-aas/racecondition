-- Run once in the Supabase SQL editor: manual ordering of gallery items.
alter table race_photos add column if not exists sort_order int;
