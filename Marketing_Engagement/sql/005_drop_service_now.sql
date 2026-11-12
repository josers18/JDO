-- "Fins".service_now held the old Service_Now ingest stream, deleted 2026-11-11. Its rows live on in
-- "Fins".service_now_cases (004), which the feed and the zero-copy stream use.
DROP TABLE IF EXISTS "Fins".service_now;
