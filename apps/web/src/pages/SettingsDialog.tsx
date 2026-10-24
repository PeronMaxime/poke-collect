import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BetaProfilesResponse,
  MeResponse,
  NotificationSettings,
  PushConfigResponse,
} from '@poke/shared';
import { Modal } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { isIos, pushSupported, useDeviceSubscription, useInstallPrompt } from '../lib/pwa';
import { MAIN_TAB_PROFILE, openProfileInNewTab, setTabProfile } from '../lib/tab-profile';

const PUSH_KEY = ['push'] as const;

const TYPES: { key: keyof NotificationSettings; label: string }[] = [
  { key: 'expeditions', label: 'Expédition terminée' },
  { key: 'eggs', label: 'Œuf prêt à éclore' },
  { key: 'fossils', label: 'Fossile restauré au Musée' },
];

/** Réglages : installation du jeu (PWA), notifications push et compte. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-xl font-bold">Réglages</h2>
      {open && (
        <>
          <InstallSection />
          <NotificationSection />
          <BetaProfilesSection />
          <AccountSection />
        </>
      )}
      <div className="mt-6 flex justify-end">
        <button className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}

function InstallSection() {
  const { canInstall, install, installed } = useInstallPrompt();
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">Application</h3>
      {installed ? (
        <p className="mt-1 text-sm text-slate-500">Dexpedition est installé sur cet appareil.</p>
      ) : canInstall ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Installe le jeu pour l’ouvrir comme une application, en plein écran.
          </p>
          <button className="btn-primary shrink-0" onClick={() => void install()}>
            Installer
          </button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-500">
          {isIos()
            ? 'Sur iPhone et iPad : bouton Partager, puis « Sur l’écran d’accueil ».'
            : 'Utilise le menu du navigateur (« Installer l’application ») pour ajouter le jeu à ton appareil.'}
        </p>
      )}
    </section>
  );
}

function NotificationSection() {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: PUSH_KEY,
    queryFn: () => api<PushConfigResponse>('/api/push'),
  });
  const device = useDeviceSubscription();
  const [error, setError] = useState<string | null>(null);

  // Un appareil déjà abonné (autre compte, abonnement renouvelé) est rattaché au joueur actuel.
  const { subscription } = device;
  const enabledOnServer = !!config.data?.publicKey;
  useEffect(() => {
    if (!subscription || !enabledOnServer) return;
    api('/api/push/subscriptions', { method: 'POST', json: subscription.toJSON() })
      .then(() => queryClient.invalidateQueries({ queryKey: PUSH_KEY }))
      .catch(() => {});
  }, [subscription, enabledOnServer, queryClient]);

  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      setError(null);
      if (!on) return device.disable();
      const ok = await device.enable(config.data!.publicKey!);
      if (!ok)
        setError('Notifications refusées par le navigateur : autorise-les dans ses réglages.');
    },
    onError: () => setError('Impossible d’activer les notifications sur cet appareil.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: PUSH_KEY }),
  });
  const saveSettings = useMutation({
    mutationFn: (settings: NotificationSettings) =>
      api<NotificationSettings>('/api/push/settings', { method: 'PUT', json: settings }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PUSH_KEY }),
  });
  const test = useMutation({
    mutationFn: () => api<{ sent: number }>('/api/push/test', { method: 'POST' }),
  });

  if (config.isPending) return <p className="mt-5 text-sm text-slate-500">Chargement…</p>;
  const data = config.data;
  const subscribed = !!device.subscription;

  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">Notifications</h3>
      {!pushSupported() ? (
        <p className="mt-1 text-sm text-slate-500">
          Ce navigateur ne gère pas les notifications push
          {isIos() && ' (sur iPhone, installe d’abord le jeu sur l’écran d’accueil)'}.
        </p>
      ) : !data?.publicKey ? (
        <p className="mt-1 text-sm text-slate-500">
          Les notifications push ne sont pas activées sur le serveur.
        </p>
      ) : (
        <>
          <label className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span>
              Prévenir sur cet appareil
              <span className="block text-xs text-slate-500">
                {device.permission === 'denied'
                  ? 'Bloquées par le navigateur.'
                  : `${data.subscriptions} appareil(s) abonné(s).`}
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={subscribed}
              disabled={device.subscription === undefined || toggle.isPending}
              onChange={(e) => toggle.mutate(e.target.checked)}
            />
          </label>
          <fieldset className="mt-3 space-y-1" disabled={saveSettings.isPending}>
            {TYPES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={data.settings[key]}
                  onChange={(e) =>
                    saveSettings.mutate({ ...data.settings, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          {subscribed && (
            <button
              className="btn-ghost mt-3"
              disabled={test.isPending}
              onClick={() => test.mutate()}
            >
              {test.data ? `Envoyée (${test.data.sent})` : 'Envoyer une notification de test'}
            </button>
          )}
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

/**
 * Bêta : profils secondaires, pour recommencer une partie sans recréer de compte. À retirer
 * après la bêta (voir `apps/api/src/beta-profiles.ts`).
 */
function BetaProfilesSection() {
  const profiles = useQuery({
    queryKey: ['beta-profiles'],
    queryFn: () => api<BetaProfilesResponse>('/api/beta/profiles'),
  });
  const [error, setError] = useState<string | null>(null);
  // Changer de profil change toutes les données du jeu : on recharge l'application.
  const onSwitched = () => window.location.reload();
  const onError = (err: unknown) =>
    setError(
      err instanceof ApiError && err.code === 'TRAINER_NAME_TAKEN'
        ? 'Ce pseudo est déjà pris par un autre dresseur.'
        : 'Action impossible, réessaie plus tard.',
    );
  const create = useMutation({
    mutationFn: () => api<BetaProfilesResponse>('/api/beta/profiles', { method: 'POST' }),
    onSuccess: (data) => {
      setTabProfile(data.activeProfileId);
      onSwitched();
    },
    onError,
  });
  const select = useMutation({
    mutationFn: (profileId: string | null) =>
      api<BetaProfilesResponse>('/api/beta/profiles/active', {
        method: 'POST',
        json: { profileId },
      }),
    // Le cookie devient le profil par défaut des nouveaux onglets ; celui-ci garde le sien.
    onSuccess: (data) => {
      const main = data.profiles.find((p) => p.main);
      setTabProfile(data.activeProfileId === main?.id ? MAIN_TAB_PROFILE : data.activeProfileId);
      onSwitched();
    },
    onError,
  });

  const data = profiles.data;
  if (!data) return null;
  const secondary = data.profiles.filter((p) => !p.main).length;
  const busy = create.isPending || select.isPending;

  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">
        Profils <span className="text-xs font-normal text-amber-600">bêta</span>
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Un profil secondaire est une nouvelle partie sur le même compte. Chaque onglet garde son
        profil : « Nouvel onglet » permet d’en jouer plusieurs en même temps. Ces profils pourront
        être supprimés à la fin de la bêta.
      </p>
      <ul className="mt-2 space-y-1">
        {data.profiles.map((p) => {
          const active = p.id === data.activeProfileId;
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {p.trainerName}
                <span className="ml-1 text-xs text-slate-500">
                  {p.main ? '(principal)' : !p.starterChosen && '(starter à choisir)'}
                </span>
              </span>
              {active ? (
                <span className="text-xs font-semibold text-emerald-600">Actif</span>
              ) : (
                <span className="flex gap-1">
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => select.mutate(p.main ? null : p.id)}
                  >
                    Jouer
                  </button>
                  <button
                    className="btn-ghost"
                    title="Jouer ce profil dans un nouvel onglet, en gardant celui-ci"
                    onClick={() => openProfileInNewTab(p.main ? MAIN_TAB_PROFILE : p.id)}
                  >
                    Nouvel onglet
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {secondary < data.maxSecondary && (
        <button className="btn-ghost mt-2" disabled={busy} onClick={() => create.mutate()}>
          Créer un profil secondaire
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

/** Compte : adresse de connexion et suppression définitive (RGPD). */
function AccountSection() {
  const queryClient = useQueryClient();
  const me = queryClient.getQueryData<MeResponse | null>(['me']);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: async () => {
      const result = await authClient.deleteUser({ password });
      if (result.error) throw new Error(result.error.message ?? '');
    },
    onSuccess: () => {
      // Comme la déconnexion (HomePage) : `me` à null d'abord, pour revenir à l'écran de connexion.
      queryClient.setQueryData(['me'], null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
    onError: (err) =>
      setError(
        /password/i.test(err.message)
          ? 'Mot de passe incorrect.'
          : err.message || 'Suppression impossible, réessaie plus tard.',
      ),
  });

  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">Compte</h3>
      {me && <p className="mt-1 text-sm text-slate-500">Connecté avec {me.user.email}.</p>}
      {!confirming ? (
        <button className="btn-danger mt-3" onClick={() => setConfirming(true)}>
          Supprimer mon compte
        </button>
      ) : (
        <form
          className="mt-3 space-y-2 rounded-lg border border-red-300 p-3 dark:border-red-900"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            remove.mutate();
          }}
        >
          <p className="text-sm">
            Ton compte et toute ta progression (Pokémon, objets, Pokédex…) seront{' '}
            <strong>supprimés définitivement</strong>. Cette action est irréversible.
          </p>
          <label className="block text-sm">
            Mot de passe, pour confirmer
            <input
              className="input mt-1"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setConfirming(false);
                setPassword('');
                setError(null);
              }}
            >
              Annuler
            </button>
            <button type="submit" className="btn-danger" disabled={remove.isPending}>
              Supprimer définitivement
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
