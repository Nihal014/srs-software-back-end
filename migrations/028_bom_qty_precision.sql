-- Recipe quantities are per ONE piece, and some ingredients are used in tiny amounts (for example
-- 0.04 kg of masala across 215 pieces is 0.000186 kg each). Four decimals rounded those to 0.0002 and
-- skewed the costing by several percent, so keep six.
ALTER TABLE bundle_bom_lines MODIFY qty_per_unit DECIMAL(14,6) NOT NULL;
