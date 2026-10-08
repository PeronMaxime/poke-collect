import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent } from '@poke/db';
import { readContentSnapshot, writeContentSnapshot } from './content-snapshot';

/** JSON aux clés triées, pour comparer sans tenir compte de l'ordre des clés. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

/** La base trie chaque collection (par ordre, puis clé) : on compare sans tenir compte de l'ordre. */
const unordered = (data: object) =>
  Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.map(canonical).sort() : canonical(v),
    ]),
  );

describe('instantané du contenu', () => {
  const dir = mkdtempSync(join(tmpdir(), 'poke-snapshot-'));
  const path = join(dir, 'content', 'game-content.json');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('écrit le contenu publié, le relit à l’identique et ne réécrit pas sans changement', async () => {
    expect(readContentSnapshot(path)).toBeNull();

    const handle = createDb({ pgliteDataDir: 'memory://' });
    await handle.migrate();
    await ensureSeedContent(handle.db, seedContent);

    expect(await writeContentSnapshot(handle.db, path)).toBe(true);
    expect(unordered(readContentSnapshot(path)!)).toEqual(unordered(seedContent));
    expect(await writeContentSnapshot(handle.db, path)).toBe(false);

    // Une base neuve importée depuis l'instantané redonne le même fichier.
    const fresh = createDb({ pgliteDataDir: 'memory://' });
    await fresh.migrate();
    await ensureSeedContent(fresh.db, readContentSnapshot(path)!);
    expect(await writeContentSnapshot(fresh.db, path)).toBe(false);

    await handle.close();
    await fresh.close();
  });
});
