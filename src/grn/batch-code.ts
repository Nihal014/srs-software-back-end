// Mnemonic used in generated batch numbers (BN-<mnemonic>-<yyyymmdd>-<grnLineId>)
// and the shelf-life suggested as a default expiry date on the "new GRN" screen.
// Both are cosmetic conveniences, not enforced — the user can always override.
export const ITEM_DEFAULTS: Record<string, { mnemonic: string; shelfLifeDays: number }> = {
  'RM-001': { mnemonic: 'CHK', shelfLifeDays: 3 },
  'RM-002': { mnemonic: 'ONI', shelfLifeDays: 30 },
  'RM-003': { mnemonic: 'GIN', shelfLifeDays: 14 },
  'RM-004': { mnemonic: 'GCH', shelfLifeDays: 6 },
  'PK-001': { mnemonic: 'BOX', shelfLifeDays: 730 },
};

export function mnemonicFor(itemCode: string): string {
  return ITEM_DEFAULTS[itemCode]?.mnemonic ?? itemCode.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();
}

export function shelfLifeDaysFor(itemCode: string): number {
  return ITEM_DEFAULTS[itemCode]?.shelfLifeDays ?? 7;
}
