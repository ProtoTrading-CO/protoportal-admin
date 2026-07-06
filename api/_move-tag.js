/**
 * 48h "moved" tag support (migration 039_product_move_tag.sql).
 * Column presence is probed once per table and cached so the move endpoints
 * keep working before the migration has been run.
 */

const SUB_FIELDS = ['subcategory_one', 'subcategory_two', 'subcategory_three', 'subcategory_four'];
const _hasMoveColumns = new Map();

export async function tableHasMoveTagColumns(supabase, table) {
  if (_hasMoveColumns.has(table)) return _hasMoveColumns.get(table);
  const { error } = await supabase.from(table).select('moved_at').limit(1);
  const has = !error;
  _hasMoveColumns.set(table, has);
  return has;
}

export function categoryPathLabel(row) {
  return [row?.category, ...SUB_FIELDS.map((f) => row?.[f])].filter(Boolean).join(' › ');
}

/**
 * Build the moved_* patch for a row moving to `destinationLabel`.
 * Returns null when the move is a no-op (same path).
 */
export function buildMoveTagPatch(oldRow, destinationLabel, stamp) {
  const from = categoryPathLabel(oldRow);
  const to = String(destinationLabel || '').trim();
  if (!to || from === to) return null;
  return {
    moved_at: stamp || new Date().toISOString(),
    moved_from: from || 'Uncategorised',
    moved_to: to,
  };
}
