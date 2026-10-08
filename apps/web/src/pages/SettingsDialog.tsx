import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeResponse, NotificationSettings, PushConfigResponse } from '@poke/shared';
import { Modal } from '../components/ui';
import { api } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { isIos, pushSupported, useDeviceSubscription, useInstallPrompt } from '../lib/pwa';

const PUSH_KEY = ['push'] as const;

const TYPES: { key: keyof NotificationSettings; label: string }[] = [
  { key: 'expeditions', label: 'Expédition terminée' },
  { key: 'battles', label: 'Combat de dresseur terminé' },
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
