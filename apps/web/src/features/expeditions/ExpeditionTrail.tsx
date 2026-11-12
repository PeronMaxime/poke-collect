/**
 * Chemin d'une expédition en cours : un décor en pixel art selon l'habitat de la zone, qui défile
 * vers la gauche (deux plans, le lointain plus lent), et l'équipe qui marche dessus vers la droite,
 * le premier Pokémon en tête.
 *
 * Chaque plan est une tuile SVG de 256 × 96 répétée à l'horizontale : tout ce qui y est dessiné
 * doit se raccorder d'un bord à l'autre (sinusoïdes et motifs de période divisant 256).
 */
import type { PokemonDto } from '@poke/shared';
import { PokemonSprite } from '../../components/ui';

const W = 256;
const H = 96;
/** Taille d'un « pixel » des reliefs. */
const STEP = 4;

type Scene = 'grassland' | 'forest' | 'cave' | 'mountain' | 'rough' | 'shore' | 'sea' | 'urban';

const HABITAT_SCENES: Record<string, Scene> = {
  grassland: 'grassland',
  forest: 'forest',
  cave: 'cave',
  mountain: 'mountain',
  'rough-terrain': 'rough',
  'waters-edge': 'shore',
  sea: 'sea',
  urban: 'urban',
};

const r = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}'/>`;

/** Dessine chaque élément d'une liste de coordonnées. */
const each = (list: readonly (readonly number[])[], draw: (...args: number[]) => string) =>
  list.map((args) => draw(...args)).join('');

const q = (y: number) => Math.round(y / STEP) * STEP;

/** Relief posé au sol : colonnes de `y(x)` jusqu'en bas. */
function ridge(y: (x: number) => number, fill: string): string {
  let out = '';
  for (let x = 0; x < W; x += STEP) {
    const top = q(y(x));
    out += r(x, top, STEP, H - top, fill);
  }
  return out;
}

/** Relief pendu au plafond (canopée, stalactites) : colonnes du haut jusqu'à `y(x)`. */
function hanging(y: (x: number) => number, fill: string): string {
  let out = '';
  for (let x = 0; x < W; x += STEP) {
    const bottom = q(y(x));
    if (bottom > 0) out += r(x, 0, STEP, bottom, fill);
  }
  return out;
}

const wave =
  (base: number, ...terms: [amplitude: number, periods: number, phase?: number][]) =>
  (x: number) =>
    terms.reduce((y, [a, k, p = 0]) => y + a * Math.sin((2 * Math.PI * k * x) / W + p), base);

/** Chaîne de sommets en dents de scie, avec neige au-dessus de `snowLine`. */
function peaks(
  period: number,
  offset: number,
  top: number,
  depth: number,
  fill: string,
  snowLine: number,
  snow: string,
): string {
  let out = '';
  for (let x = 0; x < W; x += STEP) {
    const t = (((x + offset) % period) + period) % period;
    const y = q(top + Math.abs(t / period - 0.5) * 2 * depth);
    out += r(x, y, STEP, H - y, fill);
    if (y < snowLine) out += r(x, y, STEP, snowLine - y, snow);
  }
  return out;
}

const cloud = (x: number, y: number) =>
  r(x + 4, y, 16, 4, '#fbfaf2') +
  r(x, y + 4, 28, 6, '#fbfaf2') +
  r(x + 2, y + 10, 24, 2, '#dcecf8');

const tuft = (x: number, y: number, fill: string) =>
  r(x, y, 2, 4, fill) + r(x + 3, y - 2, 2, 6, fill) + r(x + 6, y, 2, 4, fill);

/** Chemin sur lequel marche l'équipe (de y = 70 à 90), bordé de deux liserés. */
const path = (fill: string, edge: string) =>
  r(0, 70, W, 20, fill) + r(0, 68, W, 2, edge) + r(0, 90, W, 2, edge);

const ground = (fill: string, top: string) => r(0, 58, W, H - 58, fill) + r(0, 58, W, 2, top);

const SCENES: Record<Scene, { far: string; near: string }> = {
  grassland: {
    far:
      r(0, 0, W, H, '#90d0f8') +
      r(0, 30, W, 28, '#b0e0f8') +
      cloud(30, 10) +
      cloud(150, 18) +
      cloud(214, 6) +
      ridge(wave(42, [5, 2], [3, 3, 1]), '#88c868') +
      ridge(wave(51, [4, 1, 2], [2, 4]), '#68b050'),
    near:
      ground('#68b848', '#88d060') +
      // Clôture sur la gauche, hautes herbes sur la droite.
      r(4, 50, 102, 3, '#b87838') +
      r(4, 56, 102, 3, '#b87838') +
      [4, 36, 68, 100].map((x) => r(x, 46, 6, 18, '#a86830') + r(x, 46, 6, 2, '#d09858')).join('') +
      Array.from({ length: 14 }, (_, i) => 150 + i * 6)
        .map((x) => r(x, 56, 3, 12, '#3f8f2a') + r(x + 3, 59, 3, 9, '#58a838'))
        .join('') +
      path('#e8d498', '#c8b070') +
      r(30, 76, 2, 2, '#c8b070') +
      r(110, 84, 4, 2, '#c8b070') +
      r(190, 74, 2, 2, '#c8b070') +
      r(232, 86, 2, 2, '#c8b070') +
      tuft(20, 62, '#489830') +
      tuft(120, 63, '#489830') +
      tuft(60, 92, '#489830') +
      tuft(170, 92, '#489830') +
      r(50, 63, 2, 2, '#f85858') +
      r(132, 93, 2, 2, '#fbfaf2') +
      r(240, 62, 2, 2, '#f8d838'),
  },
  forest: {
    far:
      r(0, 0, W, H, '#1d4228') +
      r(0, 20, W, 40, '#26502e') +
      [12, 58, 104, 150, 196, 236].map((x) => r(x, 0, 8, 62, '#2c3a22')).join('') +
      [34, 128, 214]
        .map((x) => r(x, 0, 12, 62, '#4a3220') + r(x + 2, 0, 2, 62, '#5e4229'))
        .join('') +
      hanging(wave(16, [6, 3], [4, 5, 1]), '#2f6a36') +
      hanging(wave(8, [4, 4, 2], [3, 7]), '#3e7f40'),
    near:
      ground('#2e7034', '#3e8a40') +
      [10, 90, 170]
        .map(
          (x) =>
            r(x + 4, 50, 16, 4, '#3a9044') +
            r(x, 54, 24, 6, '#3a9044') +
            r(x + 6, 52, 4, 2, '#58b058'),
        )
        .join('') +
      path('#8e6238', '#6e4a28') +
      r(60, 70, 10, 2, '#5a3a20') +
      r(40, 78, 4, 2, '#c89040') +
      r(120, 84, 2, 2, '#b84828') +
      r(200, 75, 4, 2, '#c89040') +
      each(
        [
          [140, 61],
          [64, 91],
        ],
        (x, y) =>
          r(x, y, 8, 3, '#e04838') +
          r(x + 2, y - 2, 4, 2, '#e04838') +
          r(x + 2, y, 2, 1, '#fbfaf2') +
          r(x + 3, y + 3, 2, 3, '#f0e0c8'),
      ) +
      tuft(30, 62, '#3e9046') +
      tuft(220, 63, '#3e9046') +
      tuft(180, 93, '#3e9046'),
  },
  cave: {
    far:
      r(0, 0, W, H, '#241f33') +
      each(
        [
          [10, 20, 30, 14],
          [70, 30, 40, 18],
          [140, 14, 36, 16],
          [200, 34, 44, 14],
        ],
        (x, y, w, h) => r(x, y, w, h, '#2e2842'),
      ) +
      hanging((x) => {
        const local = x % 32;
        return (16 - Math.abs(local - 16)) * (0.6 + ((Math.floor(x / 32) * 5) % 3) * 0.4);
      }, '#3c3452') +
      ridge(wave(50, [3, 3], [2, 5, 1]), '#332c46') +
      each(
        [
          [50, 44],
          [180, 38],
        ],
        (x, y) =>
          r(x + 2, y, 2, 2, '#a8e8ff') +
          r(x, y + 2, 6, 6, '#68c0e8') +
          r(x + 2, y + 2, 2, 4, '#a8e8ff'),
      ),
    near:
      ground('#463c56', '#5a5070') +
      each(
        [
          [20, 16, 8],
          [110, 24, 10],
          [196, 12, 6],
        ],
        (x, w, h) => r(x, 58 - h, w, h, '#564a68') + r(x + 2, 58 - h, w - 4, 2, '#6c6084'),
      ) +
      r(150, 42, 4, 16, '#564a68') +
      r(148, 50, 8, 8, '#564a68') +
      path('#5e5470', '#4e4462') +
      r(36, 80, 4, 2, '#7a6e8c') +
      r(98, 74, 2, 2, '#7a6e8c') +
      r(176, 86, 4, 2, '#7a6e8c') +
      r(234, 60, 2, 2, '#a8e8ff') +
      r(232, 62, 6, 5, '#68c0e8'),
  },
  mountain: {
    far:
      r(0, 0, W, H, '#b0d4f0') +
      r(0, 34, W, 30, '#c8e2f4') +
      cloud(90, 8) +
      peaks(128, 40, 16, 42, '#8e98b8', 28, '#f0f4fc') +
      peaks(64, 10, 36, 22, '#6c7698', 42, '#e0e8f4'),
    near:
      ground('#8a7e68', '#a09478') +
      each(
        [
          [30, 20, 10],
          [150, 14, 6],
          [222, 24, 8],
        ],
        (x, w, h) => r(x, 58 - h, w, h, '#6c6252') + r(x + 2, 58 - h, w - 4, 2, '#8a806e'),
      ) +
      path('#b8ac94', '#988c74') +
      r(24, 78, 2, 2, '#9c9078') +
      r(70, 84, 4, 2, '#9c9078') +
      r(130, 74, 2, 2, '#9c9078') +
      r(204, 82, 4, 2, '#9c9078') +
      r(96, 92, 12, 4, '#6c6252') +
      tuft(80, 62, '#6e9a48') +
      tuft(190, 92, '#6e9a48'),
  },
  rough: {
    far:
      r(0, 0, W, H, '#f0c070') +
      r(0, 24, W, 40, '#f8d898') +
      r(198, 8, 12, 2, '#fff0b0') +
      r(196, 10, 16, 12, '#fff0b0') +
      r(198, 22, 12, 2, '#fff0b0') +
      each(
        [
          [0, 40, 40, 24],
          [90, 34, 50, 30],
          [180, 44, 30, 20],
        ],
        (x, y, w, h) => r(x, y, w, h, '#d8986a') + r(x, y, w, 2, '#e8b080'),
      ) +
      each(
        [
          [40, 46, 40, 20],
          [140, 42, 30, 22],
          [220, 48, 36, 18],
        ],
        (x, y, w, h) => r(x, y, w, h, '#c07040') + r(x, y, w, 2, '#d08850'),
      ),
    near:
      ground('#e0a868', '#eebc80') +
      [60, 210]
        .map(
          (x) =>
            r(x + 4, 42, 6, 20, '#4f9a48') +
            r(x + 5, 42, 1, 20, '#6cb860') +
            r(x, 50, 4, 3, '#4f9a48') +
            r(x, 44, 3, 8, '#4f9a48') +
            r(x + 10, 46, 4, 3, '#4f9a48') +
            r(x + 11, 40, 3, 8, '#4f9a48'),
        )
        .join('') +
      r(120, 52, 14, 6, '#a86840') +
      r(122, 50, 8, 2, '#b87850') +
      path('#cc9050', '#b07840') +
      r(30, 78, 8, 1, '#a06830') +
      r(36, 79, 1, 4, '#a06830') +
      r(150, 84, 10, 1, '#a06830') +
      r(152, 80, 1, 4, '#a06830') +
      r(200, 74, 6, 1, '#a06830') +
      r(90, 92, 4, 2, '#b07840') +
      r(240, 93, 6, 3, '#a86840'),
  },
  shore: {
    far:
      r(0, 0, W, H, '#98d4f8') +
      r(0, 26, W, 14, '#b4e2fa') +
      cloud(40, 8) +
      cloud(190, 14) +
      r(0, 40, W, H - 40, '#3c94d8') +
      r(0, 40, W, 2, '#78c0f0') +
      r(170, 34, 40, 6, '#5aa060') +
      r(178, 30, 24, 4, '#5aa060') +
      r(20, 46, 12, 1, '#8ccaf4') +
      r(90, 50, 16, 1, '#8ccaf4') +
      r(150, 44, 10, 1, '#8ccaf4') +
      r(220, 52, 14, 1, '#8ccaf4'),
    near:
      Array.from({ length: W / 8 }, (_, i) => r(i * 8, i % 2 ? 61 : 63, 8, 3, '#e8f6ff')).join('') +
      r(0, 65, W, 4, '#d8c088') +
      r(0, 69, W, H - 69, '#f0dca0') +
      r(0, 74, W, 16, '#e8cf8c') +
      r(40, 88, 4, 3, '#f8a8b8') +
      r(150, 92, 3, 2, '#fbfaf2') +
      r(210, 90, 6, 2, '#f87858') +
      r(212, 88, 2, 6, '#f87858') +
      r(100, 72, 2, 2, '#d8c088') +
      r(176, 80, 4, 2, '#d8c088'),
  },
  sea: {
    far:
      r(0, 0, W, H, '#a8dcf8') +
      r(0, 22, W, 14, '#c4e8fa') +
      cloud(60, 6) +
      cloud(180, 12) +
      r(0, 36, W, H - 36, '#2c7cc8') +
      r(0, 36, W, 2, '#68b0e8') +
      r(30, 44, 10, 1, '#5aa0e0') +
      r(120, 48, 14, 1, '#5aa0e0') +
      r(200, 42, 8, 1, '#5aa0e0'),
    near:
      r(0, 60, W, H - 60, '#2a72bc') +
      r(0, 76, W, H - 76, '#2668b0') +
      (
        [
          [62, [10, 96, 180]],
          [76, [50, 140, 224]],
          [90, [20, 110, 196]],
        ] as const
      )
        .flatMap(([y, xs]) =>
          xs.map((x) => r(x, y, 14, 2, '#78bcf0') + r(x + 4, y - 2, 6, 2, '#e0f2ff')),
        )
        .join(''),
  },
  urban: {
    far:
      r(0, 0, W, H, '#c4d4f0') +
      r(0, 30, W, 30, '#d4e0f4') +
      each(
        [
          [0, 20, 30],
          [34, 30, 26],
          [64, 14, 22],
          [92, 26, 34],
          [132, 8, 26],
          [162, 24, 30],
          [198, 18, 24],
          [226, 30, 30],
        ],
        (x, y, w) => building(x, y, w, '#9aa4c4', '#b8c0dc'),
      ) +
      each(
        [
          [10, 36, 40],
          [110, 40, 36],
          [180, 34, 44],
        ],
        (x, y, w) => building(x, y, w, '#7a84a4', '#9aa2c0'),
      ),
    near:
      r(0, 56, W, 12, '#b8b0a4') +
      r(0, 56, W, 2, '#cfc8bc') +
      Array.from({ length: W / 16 }, (_, i) => r(i * 16, 58, 1, 10, '#a0988c')).join('') +
      [60, 188]
        .map(
          (x) =>
            r(x, 24, 3, 38, '#4a4c5c') +
            r(x - 3, 22, 9, 4, '#4a4c5c') +
            r(x - 2, 26, 7, 2, '#f8e070'),
        )
        .join('') +
      r(120, 52, 20, 2, '#a86830') +
      r(120, 58, 20, 3, '#a86830') +
      r(122, 61, 2, 6, '#6a4420') +
      r(136, 61, 2, 6, '#6a4420') +
      r(0, 68, W, 2, '#8c867a') +
      r(0, 70, W, 20, '#c8c0b0') +
      r(0, 80, W, 1, '#aaa294') +
      Array.from({ length: W / 16 }, (_, i) => r(i * 16, 70, 1, 10, '#aaa294')).join('') +
      Array.from({ length: W / 16 }, (_, i) => r(i * 16 + 8, 81, 1, 9, '#aaa294')).join('') +
      r(0, 90, W, 2, '#8c867a') +
      r(0, 92, W, 4, '#606068'),
  },
};

/** Immeuble de la ligne d'horizon, du haut `y` jusqu'au sol, avec ses fenêtres. */
function building(x: number, y: number, w: number, fill: string, window: string): string {
  let out = r(x, y, w, 64 - y, fill);
  for (let wy = y + 4; wy < 58; wy += 8) {
    for (let wx = x + 4; wx + 3 <= x + w - 3; wx += 6) {
      out += r(wx, wy, 3, 4, (wx * 7 + wy * 3) % 11 === 0 ? '#f8e890' : window);
    }
  }
  return out;
}

const toUrl = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' shape-rendering='crispEdges'>${body}</svg>`,
  )}")`;

const urls = new Map<Scene, { far: string; near: string }>();
function sceneUrls(scene: Scene) {
  let found = urls.get(scene);
  if (!found) {
    found = { far: toUrl(SCENES[scene].far), near: toUrl(SCENES[scene].near) };
    urls.set(scene, found);
  }
  return found;
}

/** Chemin animé d'une expédition en cours (voir l'en-tête du fichier). */
export function ExpeditionTrail({
  habitat,
  team,
  done,
}: {
  /** Habitat de la zone ; inconnu ou absent (quête) : une route. */
  habitat: string | null | undefined;
  /** Équipe dans l'ordre : le premier marche en tête. */
  team: PokemonDto[];
  /** Expédition terminée : tout s'arrête. */
  done: boolean;
}) {
  const scene = (habitat && HABITAT_SCENES[habitat]) || 'grassland';
  const { far, near } = sceneUrls(scene);
  return (
    <div
      className="trail relative mt-3 h-[100px] overflow-hidden rounded-md border-2 border-ink dark:brightness-[.88]"
      data-scene={scene}
      data-paused={done ? '' : undefined}
      role="img"
      aria-label={done ? 'L’équipe a fini son expédition' : 'L’équipe en route'}
    >
      <div className="trail-layer trail-far" style={{ backgroundImage: far }} />
      <div className="trail-layer trail-near" style={{ backgroundImage: near }} />
      {/* En ligne vers la droite : le premier de l'équipe devant, à droite. */}
      <div className="absolute inset-x-0 bottom-1.5 flex flex-row-reverse justify-center">
        {team.map((p, i) => (
          <div key={p.id} className="relative -mx-2.5 sm:-mx-1">
            <span className="trail-shadow absolute bottom-0.5 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-[50%]" />
            <div className="trail-walker" style={{ animationDelay: `${-i * 0.15}s` }}>
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={64}
                className="-scale-x-100"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
