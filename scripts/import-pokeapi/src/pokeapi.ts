import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const API_BASE = 'https://pokeapi.co/api/v2/';

/**
 * Client PokéAPI avec cache disque : chaque ressource n'est téléchargée qu'une fois
 * (fair use policy). Supprimer le dossier `.cache` pour forcer un rafraîchissement.
 */
export class PokeApiClient {
  private inFlight = 0;
  private queue: (() => void)[] = [];
  fetched = 0;
  cached = 0;

  constructor(
    private readonly cacheDir: string,
    private readonly concurrency = 6,
  ) {}

  async get<T>(pathOrUrl: string): Promise<T> {
    const path = pathOrUrl.startsWith('http') ? pathOrUrl.slice(API_BASE.length) : pathOrUrl;
    const cacheFile = join(this.cacheDir, `${path.replace(/\/+$/, '').replaceAll('?', '_')}.json`);
    try {
      const data = JSON.parse(await readFile(cacheFile, 'utf8')) as T;
      this.cached++;
      return data;
    } catch {
      // absent du cache
    }
    await this.acquire();
    try {
      const data = await this.fetchWithRetry<T>(API_BASE + path);
      await mkdir(dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, JSON.stringify(data));
      this.fetched++;
      return data;
    } finally {
      this.release();
    }
  }

  private async fetchWithRetry<T>(url: string, attempts = 3): Promise<T> {
    for (let i = 1; ; i++) {
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'poke-collect-importer' } });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
        return (await res.json()) as T;
      } catch (err) {
        if (i >= attempts) throw err;
        await new Promise((r) => setTimeout(r, 500 * i));
      }
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.concurrency) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.inFlight--;
  }
}

export interface NamedResource {
  name: string;
  url: string;
}

export interface LocalizedName {
  name: string;
  language: NamedResource;
}

export function frName(names: LocalizedName[], fallback: string): string {
  return names.find((n) => n.language.name === 'fr')?.name ?? fallback;
}

export function idFromUrl(url: string): number {
  const match = /\/(\d+)\/?$/.exec(url);
  if (!match) throw new Error(`URL sans identifiant : ${url}`);
  return Number(match[1]);
}
