import type {
  AbilityCondition,
  AbilityEffect,
  AbilityParam,
  GameAbility,
  Status,
  Weather,
} from './schemas';

/**
 * Proposition d'effet pour les talents des Pokémon de Kanto et Johto, inspirée de leur effet
 * d'origine. Sert de point de départ dans l'admin (« Pré-remplir ») : seuls les talents encore
 * sans réglage dans le brouillon sont ajoutés, rien n'est écrasé.
 */

const self = (param: AbilityParam, value: number, ...conditions: AbilityCondition[]) =>
  ({ type: 'modifier', param, value, scope: 'self', conditions }) satisfies AbilityEffect;
const team = (param: AbilityParam, value: number, ...conditions: AbilityCondition[]) =>
  ({ type: 'modifier', param, value, scope: 'team', conditions }) satisfies AbilityEffect;

const when = {
  weather: (...weathers: Weather[]): AbilityCondition => ({ type: 'weather', weathers }),
  hpBelow: (fraction: number): AbilityCondition => ({ type: 'hpBelow', fraction }),
  fullHp: { type: 'fullHp' } as AbilityCondition,
  statused: { type: 'statused' } as AbilityCondition,
  superEffective: { type: 'superEffective' } as AbilityCondition,
  notVeryEffective: { type: 'notVeryEffective' } as AbilityCondition,
  attack: (...types: string[]): AbilityCondition => ({ type: 'attackType', types }),
  physical: { type: 'attackCategory', category: 'physical' } as AbilityCondition,
  special: { type: 'attackCategory', category: 'special' } as AbilityCondition,
  against: (...types: string[]): AbilityCondition => ({ type: 'opponentType', types }),
  teamHas: (...types: string[]): AbilityCondition => ({ type: 'teamHasType', types }),
  day: { type: 'timeOfDay', time: 'day' } as AbilityCondition,
};

/** Bonus de dégâts d'un type quand les PV passent sous un tiers (Brasier, Torrent…). */
const pinch = (type: string) => self('damageDealt', 50, when.attack(type), when.hpBelow(1 / 3));

const immune = (attackType: string, heal = 0): AbilityEffect => ({
  type: 'immunity',
  attackType,
  heal,
  conditions: [],
});
const noStatus = (...statuses: Status[]): AbilityEffect => ({
  type: 'statusImmunity',
  statuses,
  scope: 'self',
  conditions: [],
});
const onContact = (status: Status, chance: number): AbilityEffect => ({
  type: 'inflictStatus',
  status,
  chance,
  trigger: 'contact',
  conditions: [],
});
const onHit = (status: Status, chance: number): AbilityEffect => ({
  type: 'inflictStatus',
  status,
  chance,
  trigger: 'attack',
  conditions: [],
});
const attract = (pokemonType: string, percent: number): AbilityEffect => ({
  type: 'attractType',
  pokemonType,
  percent,
  conditions: [],
});
const setWeather = (weather: Weather): AbilityEffect => ({
  type: 'setWeather',
  weather,
  conditions: [],
});
const brick = <T extends AbilityEffect['type']>(type: T, extra: object = {}) =>
  ({ type, conditions: [], ...extra }) as unknown as Extract<AbilityEffect, { type: T }>;

const PROPOSALS: Record<string, AbilityEffect[]> = {
  adaptability: [self('stab', 33), team('typeAdvantage', 15)],
  aftermath: [brick('aftermath', { fraction: 0.25 })],
  analytic: [self('damageDealt', 20), team('restoreTime', -20)],
  'anger-point': [self('damageDealt', 50, when.hpBelow(0.5))],
  anticipation: [self('damageTaken', -10), team('restoreTime', -10)],
  'arena-trap': [team('capture', 15)],
  'battle-armor': [brick('critImmunity'), self('damageTaken', -5)],
  'big-pecks': [self('defense', 20)],
  blaze: [pinch('fire')],
  chlorophyll: [
    self('speed', 100, when.weather('sun')),
    team('expeditionDuration', -15, when.weather('sun')),
  ],
  'clear-body': [self('defense', 10), self('specialDefense', 10)],
  'cloud-nine': [brick('weatherImmunity'), self('damageTaken', -5)],
  competitive: [self('specialAttack', 15)],
  'compound-eyes': [team('lootRolls', 20)],
  contrary: [self('damageDealt', 10)],
  'cursed-body': [onContact('sleep', 0.15)],
  'cute-charm': [brick('attractGender', { chance: 0.66 }), team('eggSpeed', 25)],
  damp: [self('damageTaken', -25, when.attack('fire')), attract('water', 20)],
  defiant: [self('attack', 20)],
  download: [self('attack', 10), self('specialAttack', 10)],
  drizzle: [setWeather('rain')],
  drought: [setWeather('sun')],
  'dry-skin': [immune('water', 0.25), self('damageTaken', 25, when.attack('fire'))],
  'early-bird': [noStatus('sleep'), team('expeditionDuration', -10, when.day)],
  'effect-spore': [onContact('poison', 0.1), onContact('paralysis', 0.1), onContact('sleep', 0.1)],
  filter: [self('damageTaken', -25, when.superEffective)],
  'flame-body': [onContact('burn', 0.3), team('hatchTime', -50)],
  'flash-fire': [immune('fire'), self('damageDealt', 25, when.attack('fire'))],
  forewarn: [self('damageTaken', -10), team('restoreTime', -15)],
  'friend-guard': [team('damageTaken', -15)],
  frisk: [team('lootRolls', 15), team('hiddenAbility', 10)],
  gluttony: [team('capture', 10)],
  guts: [self('damageDealt', 50, when.statused)],
  harvest: [team('lootRolls', 25)],
  healer: [team('koDuration', -20), team('hatchTime', -15)],
  'honey-gather': [team('lootRolls', 20), team('candies', 20)],
  'huge-power': [self('attack', 100), self('power', 15)],
  hustle: [self('attack', 30), team('wildLevel', 3)],
  hydration: [
    {
      ...noStatus('paralysis', 'burn', 'poison', 'sleep', 'freeze'),
      conditions: [when.weather('rain')],
    },
  ],
  'hyper-cutter': [self('attack', 10)],
  'ice-body': [brick('weatherImmunity'), self('hp', 10, when.weather('hail'))],
  illuminate: [team('encounters', 25)],
  immunity: [noStatus('poison')],
  imposter: [self('damageDealt', 20), team('eggSpeed', 20), team('inheritedIvs', 1)],
  infiltrator: [self('damageDealt', 10), team('opponentPower', -5)],
  'inner-focus': [self('damageTaken', -5), self('koDuration', -10)],
  insomnia: [noStatus('sleep')],
  intimidate: [
    brick('intimidate', { percent: 25, stats: ['attack', 'special-attack'] }),
    team('opponentPower', -10),
  ],
  'iron-fist': [self('damageDealt', 20)],
  justified: [self('damageDealt', 30, when.against('dark'))],
  'keen-eye': [team('capture', 10)],
  'leaf-guard': [
    {
      ...noStatus('paralysis', 'burn', 'poison', 'sleep', 'freeze'),
      conditions: [when.weather('sun')],
    },
  ],
  levitate: [immune('ground')],
  'light-metal': [self('speed', 10)],
  'lightning-rod': [immune('electric'), attract('electric', 50)],
  limber: [noStatus('paralysis')],
  'liquid-ooze': [brick('contactDamage', { fraction: 0.1 })],
  'magic-bounce': [noStatus('paralysis', 'burn', 'poison', 'sleep')],
  'magic-guard': [brick('weatherImmunity'), noStatus('burn', 'poison')],
  'magma-armor': [noStatus('freeze'), team('hatchTime', -50)],
  'magnet-pull': [attract('steel', 50)],
  'marvel-scale': [self('damageTaken', -33, when.statused)],
  'mold-breaker': [self('damageDealt', 10)],
  moody: [self('damageDealt', 15), self('damageTaken', 5)],
  moxie: [brick('moxie', { percent: 15 })],
  multiscale: [self('damageTaken', -50, when.fullHp)],
  'natural-cure': [brick('naturalCure'), self('koDuration', -30)],
  'neutralizing-gas': [brick('suppressAbility'), team('opponentPower', -10)],
  'no-guard': [self('damageDealt', 15), self('damageTaken', 15)],
  oblivious: [team('happiness', 25)],
  overcoat: [brick('weatherImmunity'), noStatus('sleep')],
  overgrow: [pinch('grass')],
  'own-tempo': [self('koDuration', -15)],
  pickpocket: [team('lootRolls', 15)],
  pickup: [team('lootRolls', 25), team('money', 10)],
  plus: [self('specialAttack', 30, when.teamHas('electric'))],
  'poison-point': [onContact('poison', 0.3)],
  'poison-touch': [onHit('poison', 0.3)],
  prankster: [self('speed', 30), team('battleDuration', -15)],
  pressure: [team('wildLevel', 5), team('opponentPower', -5)],
  'quick-feet': [self('speed', 50, when.statused), team('expeditionDuration', -10)],
  'rain-dish': [{ ...brick('regenerator', { fraction: 0.2 }), conditions: [when.weather('rain')] }],
  rattled: [self('speed', 30, when.against('bug', 'ghost', 'dark'))],
  reckless: [self('damageDealt', 20)],
  regenerator: [brick('regenerator', { fraction: 0.33 })],
  rivalry: [self('damageDealt', 15)],
  'rock-head': [self('defense', 10)],
  'run-away': [team('expeditionDuration', -15)],
  'sand-force': [brick('weatherImmunity'), self('damageDealt', 30, when.weather('sand'))],
  'sand-rush': [brick('weatherImmunity'), self('speed', 100, when.weather('sand'))],
  'sand-stream': [setWeather('sand')],
  'sand-veil': [brick('weatherImmunity'), self('damageTaken', -20, when.weather('sand'))],
  'sap-sipper': [immune('grass'), self('attack', 10)],
  scrappy: [self('damageDealt', 25, when.against('ghost'))],
  'serene-grace': [team('shinyChance', 10), team('happiness', 20)],
  'shadow-tag': [team('capture', 15)],
  'shed-skin': [brick('naturalCure'), self('koDuration', -10)],
  'sheer-force': [self('damageDealt', 30)],
  'shell-armor': [brick('critImmunity'), self('damageTaken', -5)],
  'shield-dust': [noStatus('poison', 'burn', 'paralysis')],
  'skill-link': [self('damageDealt', 20)],
  sniper: [self('damageDealt', 15), team('capture', 5)],
  'snow-cloak': [brick('weatherImmunity'), self('damageTaken', -20, when.weather('hail'))],
  'solar-power': [self('specialAttack', 50, when.weather('sun'))],
  soundproof: [noStatus('sleep')],
  'speed-boost': [brick('speedBoost', { percent: 10 })],
  static: [onContact('paralysis', 0.3), attract('electric', 50)],
  steadfast: [self('speed', 10)],
  stench: [team('wildLevel', 3), self('damageDealt', 10)],
  'sticky-hold': [team('lootRolls', 10)],
  sturdy: [brick('sturdy')],
  'suction-cups': [self('defense', 10)],
  'super-luck': [self('critChance', 100), team('shinyChance', 15), team('lootRolls', 10)],
  swarm: [pinch('bug'), attract('bug', 25)],
  'swift-swim': [
    self('speed', 100, when.weather('rain')),
    team('expeditionDuration', -15, when.weather('rain')),
  ],
  synchronize: [brick('syncNature', { chance: 0.5 })],
  'tangled-feet': [self('damageTaken', -20, when.statused)],
  technician: [self('damageDealt', 25)],
  telepathy: [team('damageTaken', -10)],
  'thick-fat': [self('damageTaken', -50, when.attack('fire', 'ice'))],
  'tinted-lens': [self('damageDealt', 25), team('typeAdvantage', 10)],
  torrent: [pinch('water')],
  trace: [brick('copyZoneAffinity'), self('damageDealt', 10)],
  unaware: [self('damageTaken', -15)],
  unburden: [self('speed', 30)],
  unnerve: [team('opponentPower', -5), team('capture', 5)],
  'vital-spirit': [noStatus('sleep'), team('wildLevel', 3)],
  'volt-absorb': [immune('electric', 0.25)],
  'water-absorb': [immune('water', 0.25)],
  'water-veil': [noStatus('burn')],
  'weak-armor': [self('speed', 20), self('defense', -10)],
  'wonder-skin': [noStatus('sleep', 'paralysis')],
};

export const ABILITY_PROPOSALS: GameAbility[] = Object.entries(PROPOSALS).map(([id, effects]) => ({
  id,
  description: '',
  effects,
}));
