import type { ItemMeta } from '../data/itemIndex';
import type { SaveV3 } from './format';
import { restoreSave } from './progress';

// A progress file is a copy of the saved JSON. Anything larger than a real save is refused before it is parsed.
const MAX_FILE_CHARACTERS = 2_000_000;

export const exportSave = (save: SaveV3): string => JSON.stringify(save, null, 2);

export type ImportResult = { ok: true; save: SaveV3; status: 'restored' | 'migrated' } | { ok: false; reason: string };

// Only a file that restores cleanly is accepted. The caller replaces progress after a confirmation, never before.
export function importSave(text: string, items: readonly ItemMeta[]): ImportResult {
  if (text.length > MAX_FILE_CHARACTERS) return { ok: false, reason: 'This file is too large to be a progress save.' };
  const restored = restoreSave(text, items);
  if (restored.status === 'future') return { ok: false, reason: 'This file was saved by a newer version of the app, so it cannot be opened here.' };
  if (restored.status === 'corrupt' || restored.status === 'fresh') return { ok: false, reason: 'This file is not a valid progress save. Your progress is unchanged.' };
  return { ok: true, save: restored.save, status: restored.status };
}
