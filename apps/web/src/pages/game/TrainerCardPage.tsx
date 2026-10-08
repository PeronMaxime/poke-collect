import { earnedBadges } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PlayerProfileDto } from '@poke/shared';
import { PokemonSprite } from '../../components/ui';
import { useDexCatches, usePlayerProgress, useTrainerCard } from '../../lib/game';
import { formatMoney } from '../../lib/labels';
import { BadgeIcon } from './BattlesPage';
import { visibleRegions } from './RegionTabs';

/** Fiche Dresseur : identité, argent, badges par région et statistiques cumulées. */
export function TrainerCardPage({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const progress = usePlayerProgress();
  const dex = useDexCatches();
  const card = useTrainerCard();
  const { unlocked } = visibleRegions(ctx, progress);
  const earned = new Set(earnedBadges(ctx, progress).map((t) => t.id));
  const starter = profile.starterSpeciesId;
  const s = card.data;

  const stats: { label: string; value: string | number | undefined; hint?: string }[] = [
    { label: 'Espèces capturées', value: dex.caughtSpeciesIds.size, hint: 'Pokédex' },
    { label: 'Espèces chromatiques', value: dex.caughtShinySpeciesIds.size, hint: 'Pokédex' },
    { label: 'Pokémon capturés', value: s?.captures, hint: 'En expédition' },
    { label: 'Pokémon possédés', value: s?.pokemonOwned, hint: 'Dans le PC' },
    { label: 'Chromatiques possédés', value: s?.shiniesOwned },
    { label: 'Expéditions terminées', value: s?.expeditionsCompleted },
    { label: 'Combats gagnés', value: s?.battlesWon },
    { label: 'Combats perdus', value: s?.battlesLost },
    { label: 'Dresseurs battus', value: s?.trainersDefeated, hint: 'Différents' },
    { label: 'Œufs éclos', value: s?.eggsHatched },
    { label: 'Fossiles restaurés', value: s?.fossilsRevived },
    { label: 'Quêtes accomplies', value: s?.questsCompleted },
    {
      label: 'Dépenses en boutique',
      value: s ? formatMoney(s.moneySpent) : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-5 p-5">
        {starter !== null && <PokemonSprite speciesId={starter} size={96} />}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">Dresseur</p>
          <h2 className="text-2xl font-bold">{profile.trainerName}</h2>
          <p className="text-sm text-slate-500">
            Aventure commencée le{' '}
            {new Date(profile.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Argent</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            {formatMoney(profile.currency)}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Badges</h2>
        <div className="space-y-3">
          {unlocked.map((region) => {
            const badges = ctx.trainers.filter((t) => t.badge && t.regionId === region.id);
            if (badges.length === 0) return null;
            const count = badges.filter((t) => earned.has(t.id)).length;
            return (
              <div key={region.id} className="card p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="font-semibold">{region.name}</h3>
                  <span className="text-sm text-slate-500">
                    {count} / {badges.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {badges.map((t) => (
                    <div
                      key={t.id}
                      className={`flex items-center gap-2 text-sm ${earned.has(t.id) ? '' : 'opacity-30 grayscale'}`}
                      title={earned.has(t.id) ? `Remporté contre ${t.name}` : `Battre ${t.name}`}
                    >
                      <BadgeIcon badge={t.badge!} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.badge!.name}</span>
                        <span className="block truncate text-xs text-slate-500">{t.name}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Statistiques</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="card p-4">
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {stat.value === undefined
                  ? '…'
                  : typeof stat.value === 'number'
                    ? stat.value.toLocaleString('fr-FR')
                    : stat.value}
              </p>
              {stat.hint && <p className="text-xs text-slate-400">{stat.hint}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
