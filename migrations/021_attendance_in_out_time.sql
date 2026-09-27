-- Hourly staff are now paid from the in/out time the kitchen supervisor enters: hours are worked out
-- from the two times (an out time earlier than the in time means the shift ran past midnight) and
-- amount = hours x rate. `hours` stays as the rounded figure for display; the amount is computed from
-- the exact minutes. Older entries that only have hours keep working (times stay NULL).
ALTER TABLE attendance_entries
  ADD COLUMN in_time TIME NULL AFTER work_date,
  ADD COLUMN out_time TIME NULL AFTER in_time;
