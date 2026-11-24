/**
 * Noms choisis par les joueurs (dresseur, guilde) : refus des noms qui font croire à un compte
 * officiel (« Admin », « Modérateur », « Dexpedition »…) et des noms qui mêlent plusieurs alphabets
 * pour imiter un autre nom (« Аdmin » avec un A cyrillique). Appliqué à la création seulement :
 * les noms existants ne changent pas.
 */

/** Mots interdits n'importe où dans le nom, une fois celui-ci normalisé (voir `normalizeName`). */
const RESERVED_PARTS = [
  'admin',
  'moderat',
  'dexpedition',
  'staff',
  'officiel',
  'official',
  'system',
] as const;

/** Noms interdits tels quels (trop courts pour être cherchés à l'intérieur d'un autre nom). */
const RESERVED_NAMES = new Set(['mod', 'mods', 'modo', 'modos', 'root', 'support', 'dev', 'mj']);

/** Chiffres qui imitent une lettre (« 4dm1n »). */
const LOOKALIKE_DIGITS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
};

/**
 * Forme comparable d'un nom : lettres pleine largeur ramenées aux lettres simples (NFKC), accents
 * retirés, minuscules, chiffres sosies remplacés, tout le reste (espaces, tirets…) supprimé.
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[01345]/g, (d) => LOOKALIKE_DIGITS[d]!)
    .replace(/[^a-z0-9]/g, '');
}

/** Alphabets reconnus ; le japonais (kanji et kana) compte pour un seul. */
const SCRIPTS: [string, RegExp][] = [
  ['latin', /\p{Script=Latin}/u],
  ['grec', /\p{Script=Greek}/u],
  ['cyrillique', /\p{Script=Cyrillic}/u],
  ['arménien', /\p{Script=Armenian}/u],
  ['hébreu', /\p{Script=Hebrew}/u],
  ['arabe', /\p{Script=Arabic}/u],
  ['thaï', /\p{Script=Thai}/u],
  ['coréen', /\p{Script=Hangul}/u],
  ['japonais', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u],
];

/** Nombre d'alphabets différents parmi les lettres du nom (les alphabets non listés comptent pour un). */
function scriptCount(name: string): number {
  const found = new Set<string>();
  for (const char of name) {
    if (!/\p{L}/u.test(char)) continue;
    found.add(SCRIPTS.find(([, re]) => re.test(char))?.[0] ?? 'autre');
  }
  return found.size;
}

/** Raison du refus d'un nom de dresseur ou de guilde, ou `null` s'il est accepté. */
export function nameRefusal(name: string): string | null {
  const normalized = normalizeName(name);
  if (RESERVED_NAMES.has(normalized) || RESERVED_PARTS.some((part) => normalized.includes(part))) {
    return 'Ce nom est réservé';
  }
  if (scriptCount(name) > 1)
    return 'Un seul alphabet par nom (pas de lettres latines et cyrilliques mêlées, par exemple)';
  return null;
}
