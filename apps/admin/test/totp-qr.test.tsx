/** QR code de l'activation du second facteur : modules noirs en chemin SVG, marge comprise. */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TotpQrCode, qrPath } from '../src/components/TotpQrCode';

describe('QR code du second facteur', () => {
  it('trace un carré par module noir, aux coordonnées du module', () => {
    expect(
      qrPath([
        [false, true],
        [true, false],
      ]),
    ).toBe('M1 0h1v1h-1zM0 1h1v1h-1z');
  });

  it('affiche le QR code du lien une fois uqr chargé, marge de 4 modules comprise', async () => {
    render(<TotpQrCode value="otpauth://totp/Dexpedition:a@b.fr?secret=JBSWY3DPEHPK3PXP" />);
    const svg = await screen.findByRole('img', { name: /QR code/ });
    const size = Number(svg.getAttribute('viewBox')?.split(' ')[2]);
    // Version 3 au moins (29 modules) + 2 × 4 de marge.
    expect(size).toBeGreaterThanOrEqual(37);
    expect(svg.querySelector('path')?.getAttribute('d')).toMatch(/^M4 4h1v1h-1z/);
  });
});
