/**
 * Formulaire de départ en expédition, partagé par le jeu et le simulateur de l'admin. Ce fichier
 * n'assemble que les pièces : l'état et les estimations sont dans `useLaunchExpedition`, les
 * calculs dans `preview.ts`.
 */
import type { ReactNode } from 'react';
import type { Weather, Zone } from '@poke/content';
import type { CaughtDex, GameContext, PlayerBonuses } from '@poke/game-core';
import type { PokemonDto, RoamerDto, StartExpeditionInput } from '@poke/shared';
import { BallsSection } from './BallsSection';
import { BerriesSection } from './BerriesSection';
import { LaunchBanner, LaunchSummary } from './LaunchBanner';
import { LaunchFooter } from './LaunchFooter';
import { LaunchPreview } from './LaunchPreview';
import { LaunchTeam } from './LaunchTeam';
import type { TeamChoice } from './LaunchTeam';
import { useLaunchExpedition } from './useLaunchExpedition';

/**
 * Réglages d'une expédition (équipe, Balls par catégorie, baies) et aperçu des rencontres et
 * du butin selon le temps passé. Sans accès aux données du joueur : le jeu et le simulateur de
 * l'admin le partagent. À poser dans un `Modal` aux classes `LAUNCH_DIALOG_CLASS` : bandeau en
 * haut, barre de départ en bas, le reste défile.
 */
export function LaunchExpeditionForm({
  ctx,
  zone,
  chain,
  charm,
  owned,
  unlimitedItems = false,
  bonuses,
  weather,
  roamers = [],
  caught,
  team,
  members,
  renderTeam,
  onAutoTeam,
  extra,
  pending,
  error,
  submitLabel,
  previewMinutes = 60,
  rememberSettings = false,
  onCancel,
  onSubmit,
}: {
  ctx: GameContext;
  zone: Zone;
  /** Maillon de la chaîne de zone qu'aurait cette expédition. */
  chain: number;
  /** Multiplicateur du Charme Chroma (1 = aucun). */
  charm: number;
  /** Quantité possédée d'un objet. */
  owned: (itemId: string) => number;
  /** Stock illimité (simulateur) : les quantités ne sont pas affichées. */
  unlimitedItems?: boolean;
  /** Bonus permanents du joueur (aucun par défaut). */
  bonuses?: PlayerBonuses;
  /** Météo de la zone imposée (simulateur) ; par défaut, celle du moment. */
  weather?: Weather | null;
  /** Pokémon fuyards cachés dans la zone en ce moment. */
  roamers?: RoamerDto[];
  /**
   * Captures du Pokédex (catégorie « nouveau » ou « déjà capturé ») ; absent = tout est nouveau.
   */
  caught?: CaughtDex;
  team: string[];
  members: PokemonDto[];
  /**
   * Choix de l'équipe (un `TeamPicker`), selon sa PE, l'environnement des talents de l'expédition
   * et les règles qu'elle ne respecte pas ; `onDone` ferme la fenêtre du choix.
   */
  renderTeam: (team: TeamChoice) => ReactNode;
  /** Sélection automatique de l'équipe (bouton à côté de « Gérer »). */
  onAutoTeam?: () => void;
  /** Réglages supplémentaires, en tête de la colonne des réglages. */
  extra?: ReactNode;
  pending: boolean;
  error: ReactNode;
  /**
   * Temps d'expédition des estimations (XP, butin, fuyards) : une heure par défaut ; le simulateur
   * le règle et s'en sert comme temps passé.
   */
  previewMinutes?: number;
  /** Retient les Balls et baies choisies pour la zone, à chaque changement (jeu). */
  rememberSettings?: boolean;
  /** Libellé du bouton de départ (par défaut « Partir »). */
  submitLabel?: string;
  onCancel: () => void;
  /** Avec `previewMinutes`, que le simulateur utilise comme temps passé. */
  onSubmit: (input: StartExpeditionInput, minutes: number) => void;
}) {
  const launch = useLaunchExpedition({
    ctx,
    zone,
    chain,
    charm,
    owned,
    unlimitedItems,
    bonuses,
    weather,
    roamers,
    caught,
    team,
    members,
    duration: previewMinutes,
    rememberSettings,
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LaunchBanner launch={launch} onCancel={onCancel} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:flex lg:flex-col lg:overflow-hidden">
        <LaunchSummary launch={launch} />
        <div className="grid gap-3 p-3 sm:p-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            {extra}
            <LaunchTeam launch={launch} renderTeam={renderTeam} onAutoTeam={onAutoTeam} />
            <BallsSection launch={launch} />
            <BerriesSection launch={launch} />
          </div>
          <LaunchPreview launch={launch} />
        </div>
      </div>
      <LaunchFooter
        launch={launch}
        pending={pending}
        error={error}
        submitLabel={submitLabel}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    </div>
  );
}
