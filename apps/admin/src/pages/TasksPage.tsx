/**
 * Page « À faire » (Suivi) : ce que l'exploitant a encore à faire ou à surveiller, au même
 * endroit. Rubriques : maintenant, à surveiller, plus tard (date à venir), faites. Les tâches sont
 * partagées entre administrateurs, et chaque action est inscrite au journal.
 */
import { useState } from 'react';
import { ADMIN_TASK_DETAILS_MAX, ADMIN_TASK_TITLE_MAX } from '@poke/shared';
import type { AdminTaskDto, AdminTaskInput, AdminTaskKind } from '@poke/shared';
import { formatDate, formatDay, localDay } from '../lib/format';
import { groupTasks, taskError, useAdminTasks } from '../lib/tasks';

const KIND_LABELS: Record<AdminTaskKind, string> = {
  todo: 'À faire',
  watch: 'À surveiller',
};

type Actions = ReturnType<typeof useAdminTasks>;

/** Les tâches en rubriques, et l'ajout d'une tâche. */
export function TasksPage() {
  const actions = useAdminTasks();
  const { list } = actions;
  const [adding, setAdding] = useState(false);
  const error = [actions.create, actions.update, actions.remove].find((m) => m.isError)?.error;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">À faire</h1>
          <p className="text-sm text-slate-500">
            Ce qu’il reste à faire ou à surveiller : suites d’une mise en production, vérifications,
            rappels datés. Une tâche datée attend dans « Plus tard » jusqu’à son jour.
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            Ajouter une tâche
          </button>
        )}
      </div>

      {adding && (
        <section className="card p-5">
          <TaskForm
            submitLabel="Ajouter"
            saving={actions.create.isPending}
            onCancel={() => setAdding(false)}
            onSave={(input) => actions.create.mutate(input, { onSuccess: () => setAdding(false) })}
          />
        </section>
      )}
      {error && <p className="text-sm text-red-600">{taskError(error)}</p>}

      {list.isPending && <p className="text-slate-500">Chargement…</p>}
      {list.isError && <p className="text-red-600">{taskError(list.error)}</p>}
      {list.data && <TaskGroupsView tasks={list.data} actions={actions} />}
    </div>
  );
}

function TaskGroupsView({ tasks, actions }: { tasks: AdminTaskDto[]; actions: Actions }) {
  const groups = groupTasks(tasks, localDay());
  return (
    <>
      <TaskSection
        title="Maintenant"
        empty="Rien à faire pour l’instant."
        tasks={groups.now}
        actions={actions}
      />
      <TaskSection
        title="À surveiller"
        empty="Rien à surveiller."
        tasks={groups.watch}
        actions={actions}
      />
      {groups.later.length > 0 && (
        <TaskSection title="Plus tard" tasks={groups.later} actions={actions} showKind />
      )}
      {groups.done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-lg font-semibold">
            Faites ({groups.done.length})
          </summary>
          <div className="mt-3">
            <TaskList tasks={groups.done} actions={actions} showKind />
          </div>
        </details>
      )}
    </>
  );
}

function TaskSection({
  title,
  empty,
  tasks,
  actions,
  showKind = false,
}: {
  title: string;
  empty?: string;
  tasks: AdminTaskDto[];
  actions: Actions;
  showKind?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-slate-500">({tasks.length})</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <TaskList tasks={tasks} actions={actions} showKind={showKind} />
      )}
    </section>
  );
}

function TaskList({
  tasks,
  actions,
  showKind,
}: {
  tasks: AdminTaskDto[];
  actions: Actions;
  showKind: boolean;
}) {
  return (
    <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} actions={actions} showKind={showKind} />
      ))}
    </ul>
  );
}

/** Une tâche : case à cocher, titre, date, détail ; modification sur place, suppression confirmée. */
function TaskItem({
  task,
  actions,
  showKind,
}: {
  task: AdminTaskDto;
  actions: Actions;
  showKind: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const busy = actions.update.isPending || actions.remove.isPending;

  if (editing) {
    return (
      <li className="p-4">
        <TaskForm
          initial={task}
          submitLabel="Enregistrer"
          saving={actions.update.isPending}
          onCancel={() => setEditing(false)}
          onSave={(input) =>
            actions.update.mutate({ id: task.id, ...input }, { onSuccess: () => setEditing(false) })
          }
        />
      </li>
    );
  }
  return (
    <li className="flex gap-3 p-4">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0"
        aria-label={task.doneAt ? `Rouvrir : ${task.title}` : `Marquer comme faite : ${task.title}`}
        checked={task.doneAt !== null}
        disabled={busy}
        onChange={(e) => actions.update.mutate({ id: task.id, done: e.target.checked })}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`font-medium ${task.doneAt ? 'text-slate-500 line-through' : ''}`}>
          {task.title}
        </p>
        <TaskMeta task={task} showKind={showKind} />
        {task.details && (
          <p className="text-sm break-words whitespace-pre-wrap text-slate-600 dark:text-slate-300">
            {task.details}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {confirming ? (
          <>
            <button
              type="button"
              className="btn-danger px-2 py-1"
              disabled={busy}
              onClick={() => actions.remove.mutate(task.id)}
            >
              Supprimer
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1"
              onClick={() => setConfirming(false)}
            >
              Garder
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-ghost px-2 py-1" onClick={() => setEditing(true)}>
              Modifier
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1"
              onClick={() => setConfirming(true)}
            >
              Supprimer…
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function TaskMeta({ task, showKind }: { task: AdminTaskDto; showKind: boolean }) {
  const parts = [
    showKind && KIND_LABELS[task.kind],
    task.doneAt
      ? `${task.kind === 'todo' ? 'faite' : 'close'} le ${formatDate(task.doneAt)}`
      : task.dueOn && `à partir du ${formatDay(task.dueOn)}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="text-xs text-slate-500">{parts.join(' · ')}</p>;
}

/** Ajout ou modification : sorte, titre, date (facultative), détail. */
function TaskForm({
  initial,
  submitLabel,
  saving,
  onSave,
  onCancel,
}: {
  initial?: AdminTaskDto;
  submitLabel: string;
  saving: boolean;
  onSave: (input: Required<AdminTaskInput>) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<AdminTaskKind>(initial?.kind ?? 'todo');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ kind, title: title.trim(), details: details.trim(), dueOn: dueOn || null });
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="block text-sm">
          <span className="text-xs text-slate-500">Sorte</span>
          <select
            className="input block"
            value={kind}
            onChange={(e) => setKind(e.target.value as AdminTaskKind)}
          >
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-64 flex-1 text-sm">
          <span className="text-xs text-slate-500">Titre</span>
          <input
            className="input block w-full"
            value={title}
            maxLength={ADMIN_TASK_TITLE_MAX}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-slate-500">À partir du (facultatif)</span>
          <input
            className="input block"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-xs text-slate-500">Détail (commandes, liens, contexte)</span>
        <textarea
          className="input block w-full font-mono text-xs"
          rows={4}
          value={details}
          maxLength={ADMIN_TASK_DETAILS_MAX}
          onChange={(e) => setDetails(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
