import type { AdminSection } from '../sections';

export function PlaceholderPage({ section }: { section: AdminSection }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">{section.label}</h1>
      <p className="mt-2 text-slate-500">{section.description}</p>
      <div className="card mt-6 text-sm text-slate-500">
        Cette section sera disponible en phase {section.phase} de la roadmap.
      </div>
    </div>
  );
}
