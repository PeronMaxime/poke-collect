import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse, PlayerProfileDto } from '@poke/shared';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useNow } from '../components/ui';
import { authClient } from '../lib/auth-client';
import { claimableRewardCount, eggsLaid } from '@poke/game-core';
import {
  isUsable,
  useBattles,
  useClaimedRewards,
  useDaycare,
  useDexCatches,
  useEvolutionChecker,
  useExpeditions,
  useGameContext,
  useMuseum,
  usePokemon,
  useQuests,
  useShop,
} from '../lib/game';
import { formatMoney } from '../lib/labels';
import { BattlesPage } from './game/BattlesPage';
import { DaycarePage } from './game/DaycarePage';
import { ExpeditionsPage } from './game/ExpeditionsPage';
import { InventoryPage } from './game/InventoryPage';
import { MuseumPage } from './game/MuseumPage';
import { PcPage } from './game/PcPage';
import { PokedexPage } from './game/PokedexPage';
import { QuestsPage } from './game/QuestsPage';
import { ShopPage } from './game/ShopPage';
import { SettingsDialog } from './SettingsDialog';

const TABS = [
  { id: 'expeditions', label: 'Expéditions' },
  { id: 'battles', label: 'Dresseurs' },
  { id: 'daycare', label: 'Pension' },
  { id: 'museum', label: 'Musée' },
  { id: 'quests', label: 'Quêtes' },
  { id: 'shop', label: 'Boutique' },
  { id: 'pc', label: 'PC' },
  { id: 'pokedex', label: 'Pokédex' },
  { id: 'bag', label: 'Sac' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function tabFromHash(): TabId {
  const hash = window.location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'expeditions';
}

/** Coquille du jeu : en-tête, onglets (synchronisés avec l'ancre de l'URL) et pied de page. */
export function HomePage({ me, profile }: { me: MeResponse; profile: PlayerProfileDto }) {
  const queryClient = useQueryClient();
  const ctx = useGameContext();
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const expeditions = useExpeditions();
  const daycare = useDaycare();
  const museum = useMuseum();
  const battles = useBattles();
  const shop = useShop();
  const quests = useQuests();
  const pokemon = usePokemon();
  const claimed = useClaimedRewards();
  const evolutionsOf = useEvolutionChecker(ctx);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const now = useNow(5000);
  const finished = expeditions.data?.active.filter((e) => Date.parse(e.endsAt) <= now).length ?? 0;
  const battlesDone = battles.data?.active.filter((b) => Date.parse(b.endsAt) <= now).length ?? 0;
  const dexCatches = useDexCatches();
  const caught = dexCatches.caughtSpeciesIds.size;
  // Paliers et collections à réclamer, Pokémon disponibles prêts à évoluer.
  const rewardsReady = ctx ? claimableRewardCount(ctx, dexCatches, claimed) : 0;
  const evolutionsReady =
    pokemon.data?.filter((p) => isUsable(p, now) && evolutionsOf(p).some((e) => e.method)).length ??
    0;
  const questsReady = quests.data?.quests.filter((q) => q.status === 'completed').length ?? 0;
  // Articles débloqués pas encore vus (évalués par le serveur à chaque chargement de la boutique).
  const shopNew = shop.data?.entries.filter((e) => e.isNew).length ?? 0;
  // Œufs à faire éclore + pensions où des œufs attendent d'être ramassés.
  const daycareReady =
    (daycare.data?.eggs.filter((e) => Date.parse(e.hatchAt) <= now).length ?? 0) +
    (ctx && daycare.data
      ? daycare.data.pensions.filter((p) => eggsLaid(ctx, new Date(p.startedAt), new Date(now)) > 0)
          .length
      : 0);

  const fossilsReady =
    museum.data?.revivals.filter((r) => Date.parse(r.readyAt) <= now).length ?? 0;

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-end gap-4">
          <div>
            <p className="text-xs text-slate-500">Dresseur</p>
            <h1 className="text-xl font-bold">{profile.trainerName}</h1>
          </div>
          <p
            className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            title="Poké Dollars"
          >
            {formatMoney(profile.currency)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {me.user.role === 'admin' && (
            <a
              className="btn-ghost"
              href={import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174'}
            >
              Admin
            </a>
          )}
          <button className="btn-ghost" onClick={() => setSettingsOpen(true)}>
            Réglages
          </button>
          <button className="btn-ghost" onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <nav className="sticky top-0 z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className={`relative shrink-0 px-4 py-3 text-sm font-medium transition ${
              tab === t.id
                ? 'text-brand-600 dark:text-brand-500'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {t.label}
            {t.id === 'expeditions' && finished > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-xs text-white">
                {finished}
              </span>
            )}
            {t.id === 'battles' && battlesDone > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-xs text-white">
                {battlesDone}
              </span>
            )}
            {t.id === 'daycare' && daycareReady > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-xs text-white">
                {daycareReady}
              </span>
            )}
            {t.id === 'museum' && fossilsReady > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-xs text-white">
                {fossilsReady}
              </span>
            )}
            {t.id === 'quests' && questsReady > 0 && (
              <span
                className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-amber-950"
                title="Récompenses de quête à réclamer"
              >
                {questsReady}
              </span>
            )}
            {t.id === 'shop' && shopNew > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-amber-950">
                {shopNew}
              </span>
            )}
            {t.id === 'pokedex' && ctx && (
              <span className="ml-1.5 text-xs text-slate-400">{caught}</span>
            )}
            {t.id === 'pokedex' && rewardsReady > 0 && (
              <span
                className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-amber-950"
                title="Récompenses à réclamer"
              >
                {rewardsReady}
              </span>
            )}
            {t.id === 'pc' && evolutionsReady > 0 && (
              <span
                className="ml-1.5 rounded-full bg-emerald-500 px-1.5 text-xs text-white"
                title="Pokémon prêts à évoluer"
              >
                {evolutionsReady}
              </span>
            )}
            {tab === t.id && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-brand-500" />
            )}
          </a>
        ))}
      </nav>

      {!ctx ? (
        <p className="text-slate-500">Chargement…</p>
      ) : (
        // Une erreur dans un onglet n'emporte pas la navigation ; changer d'onglet la réinitialise.
        <ErrorBoundary key={tab}>
          {tab === 'expeditions' && <ExpeditionsPage ctx={ctx} />}
          {tab === 'battles' && <BattlesPage ctx={ctx} />}
          {tab === 'daycare' && <DaycarePage ctx={ctx} />}
          {tab === 'museum' && <MuseumPage ctx={ctx} />}
          {tab === 'quests' && <QuestsPage ctx={ctx} />}
          {tab === 'shop' && <ShopPage ctx={ctx} />}
          {tab === 'pc' && <PcPage ctx={ctx} />}
          {tab === 'pokedex' && <PokedexPage ctx={ctx} profile={profile} />}
          {tab === 'bag' && <InventoryPage ctx={ctx} />}
        </ErrorBoundary>
      )}

      <footer className="mt-12 text-center text-xs text-slate-400">
        Projet de fan non commercial. Pokémon © Nintendo / Creatures / Game Freak. Données :
        PokéAPI. Contenu v{ctx?.content.versionId ?? '…'}
      </footer>
    </div>
  );
}
