import type { MouseEvent, ReactNode } from 'react';

/**
 * Pages légales (mentions légales, confidentialité), lisibles sans être connecté. Le texte décrit
 * ce que fait réellement le serveur : le mettre à jour si les données ou les prestataires changent.
 */

export const LEGAL_NOTICE_PATH = '/mentions-legales';
export const PRIVACY_PATH = '/confidentialite';
export const LEGAL_PATHS: readonly string[] = [LEGAL_NOTICE_PATH, PRIVACY_PATH];

const CONTACT_EMAIL = 'contact@dexpedition.fr';
const UPDATED_AT = '9 octobre 2026';

/** Navigation interne sans rechargement : App suit l'adresse via l'événement popstate. */
function navigate(e: MouseEvent<HTMLAnchorElement>, path: string) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

function InternalLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a href={to} onClick={(e) => navigate(e, to)} className="hover:underline">
      {children}
    </a>
  );
}

/** Liens vers les pages légales, pour l'écran de connexion et le pied de page du jeu. */
export function LegalLinks() {
  return (
    <span className="inline-flex gap-3">
      <InternalLink to={LEGAL_NOTICE_PATH}>Mentions légales</InternalLink>
      <InternalLink to={PRIVACY_PATH}>Confidentialité</InternalLink>
    </span>
  );
}

/** Avertissement de projet de fan, affiché sur l'écran de connexion et dans le jeu. */
export function FanDisclaimer() {
  return (
    <>
      Projet de fan gratuit et non commercial, sans publicité ni achat. Pokémon et les noms des
      personnages sont des marques de Nintendo, Creatures Inc. et Game Freak ; © The Pokémon
      Company. Dexpedition n’est ni affilié ni approuvé par ces sociétés.
    </>
  );
}

export function LegalPage({ pathname }: { pathname: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <a
        href="/"
        onClick={(e) => navigate(e, '/')}
        className="text-sm text-slate-500 hover:underline"
      >
        ← Retour au jeu
      </a>
      <article className="card mt-4 space-y-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {pathname === PRIVACY_PATH ? <Privacy /> : <LegalNotice />}
        <p className="pt-2 text-xs text-slate-500">Dernière mise à jour : {UPDATED_AT}.</p>
      </article>
    </main>
  );
}

function Mail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
      {CONTACT_EMAIL}
    </a>
  );
}

function LegalNotice() {
  return (
    <>
      <h1 className="text-2xl font-bold">Mentions légales</h1>

      <h2>Éditeur</h2>
      <p>
        Le site dexpedition.fr est édité par Maxime Peron, à titre personnel et non professionnel,
        qui en est aussi le directeur de la publication. Contact : <Mail />.
      </p>
      <p>
        Conformément à l’article 6, III, 2° de la loi n° 2004-575 du 21 juin 2004 pour la confiance
        dans l’économie numérique, l’éditeur a communiqué ses coordonnées complètes à l’hébergeur.
      </p>

      <h2>Hébergement</h2>
      <p>
        OVH SAS, 2 rue Kellermann, 59100 Roubaix, France. Téléphone : +33 9 72 10 10 07. Site :{' '}
        <a href="https://www.ovhcloud.com" className="underline">
          ovhcloud.com
        </a>
        . Le serveur est situé dans le centre de données OVHcloud de Beauharnois (Québec, Canada).
      </p>

      <h2>Projet de fan</h2>
      <p>
        Dexpedition est un jeu gratuit et non commercial, créé par un fan : aucune publicité, aucun
        achat, aucune contrepartie financière. Pokémon, les noms des Pokémon, des personnages et des
        lieux, ainsi que les images associées, sont des marques et des œuvres de Nintendo, Creatures
        Inc., Game Freak et The Pokémon Company, à qui ils appartiennent. Dexpedition n’est ni
        affilié, ni sponsorisé, ni approuvé par ces sociétés.
      </p>
      <p>
        Les données des Pokémon et les images proviennent de{' '}
        <a href="https://pokeapi.co" className="underline">
          PokéAPI
        </a>
        . Tout ayant droit qui souhaite le retrait d’un élément peut écrire à <Mail /> : il sera
        retiré dans les meilleurs délais.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Voir la <InternalLink to={PRIVACY_PATH}>politique de confidentialité</InternalLink>.
      </p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1 className="text-2xl font-bold">Politique de confidentialité</h1>
      <p>
        Dexpedition collecte le minimum nécessaire pour faire fonctionner le jeu. Aucune donnée
        n’est vendue, aucune publicité n’est affichée et aucun outil de mesure d’audience ou de
        suivi n’est utilisé.
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        Maxime Peron, éditeur du site (voir les{' '}
        <InternalLink to={LEGAL_NOTICE_PATH}>mentions légales</InternalLink>). Contact : <Mail />.
      </p>

      <h2>Données collectées et utilisation</h2>
      <ul>
        <li>
          <strong>Compte</strong> : adresse e-mail et mot de passe (stocké sous forme chiffrée
          irréversible, jamais en clair). Ils servent à te connecter et, si tu le demandes, à
          t’envoyer un lien de réinitialisation du mot de passe.
        </li>
        <li>
          <strong>Partie</strong> : nom de dresseur, Pokémon, objets, progression, réglages du jeu.
        </li>
        <li>
          <strong>Sessions de connexion</strong> : adresse IP et type de navigateur, pour sécuriser
          ton compte.
        </li>
        <li>
          <strong>Notifications</strong> (seulement si tu les actives) : l’adresse d’abonnement
          fournie par ton navigateur et le type d’appareil, pour te prévenir quand une expédition,
          un combat ou un œuf est prêt.
        </li>
        <li>
          <strong>Journaux techniques</strong> : adresse IP et requêtes reçues par le serveur, pour
          la sécurité (limitation des abus) et la correction des erreurs.
        </li>
      </ul>
      <p>
        Bases légales : l’exécution du service que tu demandes en créant un compte (compte, partie,
        sessions), ton consentement pour les notifications (que tu peux retirer à tout moment dans
        les réglages du jeu ou du navigateur), et l’intérêt légitime à sécuriser le service
        (journaux techniques).
      </p>

      <h2>Durée de conservation</h2>
      <ul>
        <li>Compte et partie : tant que le compte existe.</li>
        <li>
          Sessions : jusqu’à la déconnexion ou l’expiration de la session (7 jours sans visite).
        </li>
        <li>
          Abonnements aux notifications : jusqu’à leur désactivation ou leur expiration côté
          navigateur.
        </li>
        <li>
          Journaux techniques : effacés automatiquement au fil de l’eau, quelques semaines au plus.
        </li>
        <li>
          Sauvegardes de la base : 5 semaines au plus. Après la suppression d’un compte, ses données
          peuvent donc subsister dans les sauvegardes jusqu’à leur effacement automatique.
        </li>
        <li>Un compte resté inactif pendant 3 ans peut être supprimé.</li>
      </ul>

      <h2>Hébergement et destinataires</h2>
      <p>
        Les données sont stockées sur un serveur loué à OVH SAS, situé au Canada (Beauharnois,
        Québec). Le Canada fait l’objet d’une décision d’adéquation de la Commission européenne : le
        niveau de protection y est reconnu équivalent à celui de l’Union européenne.
      </p>
      <p>
        Seul l’éditeur a accès aux données. Elles ne sont transmises à des tiers que pour le
        fonctionnement du service :
      </p>
      <ul>
        <li>
          le service de notifications de ton navigateur (Google, Mozilla, Apple ou Microsoft) reçoit
          le contenu des notifications que tu as activées ;
        </li>
        <li>
          le prestataire d’envoi d’e-mails reçoit ton adresse lorsque tu demandes un lien de
          réinitialisation du mot de passe.
        </li>
      </ul>

      <h2>Cookies et stockage local</h2>
      <p>
        Le site n’utilise qu’un cookie de session, indispensable pour rester connecté, et le cache
        du navigateur pour fonctionner comme une application installée (fichiers du jeu, images).
        Ils ne servent à aucun suivi : aucun consentement n’est donc demandé.
      </p>

      <h2>Tes droits</h2>
      <p>
        Tu disposes d’un droit d’accès, de rectification, d’effacement, de portabilité, de
        limitation et d’opposition sur tes données. Tu peux supprimer ton compte et toutes les
        données de ta partie à tout moment dans <strong>Réglages → Compte</strong>. Pour toute autre
        demande, écris à <Mail /> : une réponse te sera apportée sous un mois.
      </p>
      <p>
        Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la
        CNIL (
        <a href="https://www.cnil.fr" className="underline">
          cnil.fr
        </a>
        ).
      </p>
      <p>Si tu as moins de 15 ans, demande l’accord d’un parent avant de créer un compte.</p>
    </>
  );
}
