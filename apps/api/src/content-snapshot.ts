import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gameContentSchema } from '@poke/content';
import type { GameContentData } from '@poke/content';
import { loadPublishedContent } from '@poke/db';
import type { Db } from '@poke/db';

/**
 * Instantané du contenu publié, versionné dans Git (`content/game-content.json`).
 * Il garde les ajustements faits dans l'admin et sert de contenu initial à une base neuve
 * (dont la prod), à la place du contenu de test.
 */
export function readContentSnapshot(path: string): GameContentData | null {
  if (!existsSync(path)) return null;
  return gameContentSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** Écrit le contenu publié dans l'instantané. Retourne vrai si le fichier a changé. */
export async function writeContentSnapshot(db: Db, path: string): Promise<boolean> {
  const { versionId: _versionId, ...data } = await loadPublishedContent(db);
  const json = `${JSON.stringify(data, null, 2)}\n`;
  if (existsSync(path) && readFileSync(path, 'utf8') === json) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, json);
  return true;
}
