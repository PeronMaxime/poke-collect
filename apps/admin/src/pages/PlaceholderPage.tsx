import type { AdminSection } from '../sections';

/** Dernière phase numérotée de la roadmap (PLAN.md) ; au-delà : « Plus tard ». */
const LAST_ROADMAP_PHASE = 8;

export function PlaceholderPage({ section }: { section: AdminSection }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">{section.label}</h1>
      <p className="mt-2 text-slate-500">{section.description}</p>
      <div className="card mt-6 text-sm text-slate-500">
        {section.phase > LAST_ROADMAP_PHASE
          ? 'Cette section est prévue plus tard (« Plus tard / à étudier » dans la roadmap).'
          : `Cette section sera disponible en phase ${section.phase} de la roadmap.`}
      </div>
    </div>
  );
}
