-- A production run's labour can now be worked out from payroll: the day's wages are shared across
-- every run made that day in proportion to units (wages / total units on that day). Runs flagged
-- with labor_from_payroll = 1 are recalculated whenever another run is recorded on the same date;
-- runs whose labour was typed in by hand (and every run recorded before this column existed) stay 0
-- and are never touched.
ALTER TABLE bundle_productions
  ADD COLUMN labor_from_payroll TINYINT(1) NOT NULL DEFAULT 0 AFTER labor_cost_per_unit;
