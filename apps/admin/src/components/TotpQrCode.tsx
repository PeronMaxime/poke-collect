/**
 * QR code du lien `otpauth://` de l'activation du second facteur, à scanner avec l'application
 * d'authentification. `uqr` est chargé à la demande : seul un administrateur qui active le second
 * facteur le télécharge, l'admin ouvre sans lui (plafond de poids de la CI).
 */
import { useEffect, useState } from 'react';

/** Marge blanche autour du code, en modules (4 = valeur de la norme, que les lecteurs attendent). */
const QUIET_ZONE = 4;

/** Chemin SVG des modules noirs : un carré de 1 × 1 par module, marge comprise dans `data`. */
export function qrPath(data: boolean[][]): string {
  const parts: string[] = [];
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  return parts.join('');
}

/** QR code de `value` ; rien tant que `uqr` n'est pas chargé (la clé à recopier reste affichée). */
export function TotpQrCode({ value }: { value: string }) {
  const [qr, setQr] = useState<{ size: number; path: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void import('uqr').then(({ encode }) => {
      if (!alive) return;
      const { size, data } = encode(value, { ecc: 'M', border: QUIET_ZONE });
      setQr({ size, path: qrPath(data) });
    });
    return () => {
      alive = false;
    };
  }, [value]);

  if (!qr) return null;
  return (
    <svg
      role="img"
      aria-label="QR code à scanner avec l’application d’authentification"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      className="mx-auto my-2 h-48 w-48 rounded bg-white"
      shapeRendering="crispEdges"
    >
      <path d={qr.path} fill="#000" />
    </svg>
  );
}
