import nodemailer from 'nodemailer';

/**
 * Envoi des e-mails (réinitialisation du mot de passe, vérification de l'adresse) : par SMTP, ou
 * dans la console en développement.
 */

/** Un e-mail à envoyer, en version texte et en version HTML. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Envoi d'un e-mail (tests : faux expéditeur qui garde les messages). */
export type Mailer = (message: MailMessage) => Promise<void>;

/**
 * Expéditeur SMTP (Brevo, Resend, OVH… : tous proposent un accès SMTP).
 * `smtpUrl` : `smtps://utilisateur:motdepasse@smtp.exemple.com:465` (ou `smtp://…:587`).
 */
export function smtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return async (message) => {
    await transport.sendMail({ from, ...message });
  };
}

/** Développement sans SMTP : le message (et donc le lien) est affiché dans la console. */
export function consoleMailer(log: (text: string) => void): Mailer {
  return async ({ to, subject, text }) => {
    log(`E-mail pour ${to} : ${subject}\n${text}`);
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** E-mail de réinitialisation du mot de passe. */
export function resetPasswordMail(to: string, url: string): MailMessage {
  const subject = 'Dexpedition : réinitialisation du mot de passe';
  const text = [
    'Bonjour,',
    '',
    'Tu as demandé à réinitialiser ton mot de passe Dexpedition. Ouvre ce lien pour en choisir un nouveau (valable 1 heure) :',
    url,
    '',
    'Si tu n’as rien demandé, ignore cet e-mail : ton mot de passe ne change pas.',
  ].join('\n');
  const link = escapeHtml(url);
  const html = `<p>Bonjour,</p>
<p>Tu as demandé à réinitialiser ton mot de passe Dexpedition. Ce lien est valable 1 heure :</p>
<p><a href="${link}">Choisir un nouveau mot de passe</a></p>
<p style="color:#64748b">Si tu n’as rien demandé, ignore cet e-mail : ton mot de passe ne change pas.</p>`;
  return { to, subject, text, html };
}

/** E-mail de vérification de l'adresse, envoyé à l'inscription (et à une connexion avant le clic). */
export function verifyEmailMail(to: string, url: string): MailMessage {
  const subject = 'Dexpedition : confirme ton adresse e-mail';
  const text = [
    'Bonjour,',
    '',
    'Bienvenue sur Dexpedition ! Ouvre ce lien pour confirmer ton adresse et entrer dans le jeu (valable 24 heures) :',
    url,
    '',
    'Si tu n’as pas créé de compte, ignore cet e-mail : il ne sera pas activé.',
  ].join('\n');
  const link = escapeHtml(url);
  const html = `<p>Bonjour,</p>
<p>Bienvenue sur Dexpedition ! Ce lien confirme ton adresse et t’ouvre le jeu (valable 24 heures) :</p>
<p><a href="${link}">Confirmer mon adresse</a></p>
<p style="color:#64748b">Si tu n’as pas créé de compte, ignore cet e-mail : il ne sera pas activé.</p>`;
  return { to, subject, text, html };
}
