/**
 * Icônes en pixels des fenêtres de la colonne des bâtiments.
 */
import type { ReactNode } from 'react';

function PixelIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
      {children}
    </svg>
  );
}

export function CenterIcon() {
  return (
    <PixelIcon>
      <path d="M2 0h3v2h2v3h-2v2h-3v-2h-2v-3h2z" fill="#d83828" />
      <path d="M3 1h1v2h2v1h-2v2h-1v-2h-2v-1h2z" fill="#fbfaf2" />
    </PixelIcon>
  );
}

export function HouseIcon() {
  return (
    <PixelIcon>
      <path d="M3 0h1v1h1v1h1v1h1v1h-1v3h-5v-3h-1v-1h1v-1h1v-1h1z" fill="#d88a38" />
      <path d="M3 4h1v3h-1z" fill="#283048" />
    </PixelIcon>
  );
}

export function EggIcon() {
  return (
    <PixelIcon>
      <path d="M3 0h1v1h1v1h1v4h-1v1h-3v-1h-1v-4h1v-1h1z" fill="#fbfaf2" />
      <path d="M2 3h1v1h-1zM4 4h1v1h-1zM3 5h1v1h-1z" fill="#78c060" />
    </PixelIcon>
  );
}

export function MuseumIcon() {
  return (
    <PixelIcon>
      <path
        d="M3 0h1v1h2v1h1v1h-7v-1h1v-1h2zM1 3h1v3h-1zM3 3h1v3h-1zM5 3h1v3h-1zM0 6h7v1h-7z"
        fill="#6878a8"
      />
    </PixelIcon>
  );
}

export function SproutIcon() {
  return (
    <PixelIcon>
      <path d="M3 2h1v5h-1z" fill="#3c7a28" />
      <path d="M0 1h1v-1h2v1h1v1h-1v1h-2v-1h-1zM5 0h2v2h-1v1h-2v-2h1z" fill="#58a838" />
    </PixelIcon>
  );
}

export function LockIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 7 8" shapeRendering="crispEdges" aria-hidden>
      <path d="M2 0h3v1h1v2h1v5h-7v-5h1v-2h1zM2 1v2h3v-2z" fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
