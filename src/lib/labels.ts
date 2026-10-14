import type { MovementType } from '../api/types';

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  sale: 'Sale',
  refund_to_shelf: 'Refund to shelf',
  void: 'Void',
  receiving: 'Receiving',
  opening_balance: 'Opening balance',
  count_adjustment: 'Count adjustment',
  damaged: 'Damaged',
  expired: 'Expired',
  missing: 'Missing',
  found: 'Found',
  import_adjustment: 'Import adjustment',
};
