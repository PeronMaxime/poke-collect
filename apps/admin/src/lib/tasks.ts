/**
 * Tâches de suivi dans l'admin (routes `/api/admin/tasks`, page « À faire ») : la liste, ses
 * actions, et son classement en rubriques. Chaque action recharge la liste et le journal.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTaskDto, AdminTaskInput, AdminTaskUpdate } from '@poke/shared';
import { ApiError, api } from './api';
import { errorMessage } from './content';

const TASKS_KEY = ['admin-tasks'];

/** Message lisible d'un refus (première règle non respectée d'un champ). */
export function taskError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'NOT_FOUND') return 'Cette tâche a déjà été supprimée.';
    const issues = (err.body as { issues?: { message?: string }[] } | null)?.issues;
    if (err.code === 'VALIDATION' && issues?.[0]?.message) return issues[0].message;
  }
  return errorMessage(err);
}

/** Toutes les tâches, et leurs actions. */
export function useAdminTasks() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => api<AdminTaskDto[]>('/api/admin/tasks'),
  });
  const refresh = () =>
    Promise.all(
      [TASKS_KEY, ['audit-log']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  const create = useMutation({
    mutationFn: (input: AdminTaskInput) =>
      api<AdminTaskDto>('/api/admin/tasks', { method: 'POST', json: input }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: AdminTaskUpdate & { id: string }) =>
      api<AdminTaskDto>(`/api/admin/tasks/${id}`, { method: 'PATCH', json: input }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/api/admin/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return { list, create, update, remove };
}

/** Les rubriques de la page, dans l'ordre. */
export interface TaskGroups {
  /** À faire, sans date ou dont la date est arrivée. */
  now: AdminTaskDto[];
  /** À surveiller, sans date ou dont la date est arrivée. */
  watch: AdminTaskDto[];
  /** À faire ou à surveiller à partir d'un jour à venir, la plus proche d'abord. */
  later: AdminTaskDto[];
  /** Faites ou closes, la plus récente d'abord. */
  done: AdminTaskDto[];
}

/** Range les tâches en rubriques ; `today` au format AAAA-MM-JJ (jour local de l'exploitant). */
export function groupTasks(tasks: AdminTaskDto[], today: string): TaskGroups {
  const groups: TaskGroups = { now: [], watch: [], later: [], done: [] };
  for (const task of tasks) {
    if (task.doneAt) groups.done.push(task);
    else if (task.dueOn && task.dueOn > today) groups.later.push(task);
    else groups[task.kind === 'todo' ? 'now' : 'watch'].push(task);
  }
  groups.later.sort((a, b) => a.dueOn!.localeCompare(b.dueOn!));
  groups.done.sort((a, b) => b.doneAt!.localeCompare(a.doneAt!));
  return groups;
}
