import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BalanceSettings, GameContent } from '@poke/content';
import { createGameContext } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { ContentVersionDetailDto, ContentVersionDto } from '@poke/shared';
import { ApiError, api } from './api';

/** Segments d'URL des entités de contenu (voir les routes /api/admin/content/versions/:id/…). */
export type EntityCollection =
  | 'regions'
  | 'species'
  | 'items'
  | 'loot-tables'
  | 'zones'
  | 'trainers'
  | 'shop-categories'
  | 'shop-entries'
  | 'evolutions'
  | 'dex-milestones'
  | 'collections'
  | 'quests';

export const versionsQuery = {
  queryKey: ['content-versions'],
  queryFn: () => api<ContentVersionDto[]>('/api/admin/content/versions'),
};

export interface WorkingVersion {
  version: ContentVersionDto;
  content: GameContent;
  issues: ContentVersionDetailDto['issues'];
  ctx: GameContext;
  /** Seul un brouillon est modifiable ; sinon on affiche la version publiée en lecture seule. */
  editable: boolean;
}

/** Version sur laquelle on travaille : le brouillon s'il existe, sinon la version publiée. */
export function useWorkingVersion(): { data?: WorkingVersion; isPending: boolean; error: unknown } {
  const versions = useQuery(versionsQuery);
  const target =
    versions.data?.find((v) => v.status === 'draft') ??
    versions.data?.find((v) => v.status === 'published');
  const detail = useQuery({
    queryKey: ['content-version', target?.id],
    queryFn: () => api<ContentVersionDetailDto>(`/api/admin/content/versions/${target!.id}`),
    enabled: !!target,
  });
  const data = useMemo(
    () =>
      detail.data && {
        version: detail.data.version,
        content: detail.data.content,
        issues: detail.data.issues,
        ctx: createGameContext(detail.data.content),
        editable: detail.data.version.status === 'draft',
      },
    [detail.data],
  );
  return {
    data,
    isPending: versions.isPending || (!!target && detail.isPending),
    error: versions.error ?? detail.error,
  };
}

/** Rafraîchit tout ce qui dépend du contenu après une modification. */
export function useRefreshContent() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['content-versions'], ['content-version'], ['audit-log']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useSaveEntity<T>(versionId: number | undefined, collection: EntityCollection) {
  const refresh = useRefreshContent();
  return useMutation({
    mutationFn: ({ entity, key }: { entity: T; key: string | null }) =>
      key === null
        ? api<T>(`/api/admin/content/versions/${versionId}/${collection}`, {
            method: 'POST',
            json: entity,
          })
        : api<T>(
            `/api/admin/content/versions/${versionId}/${collection}/${encodeURIComponent(key)}`,
            {
              method: 'PUT',
              json: entity,
            },
          ),
    onSuccess: refresh,
  });
}

export function useDeleteEntity(versionId: number | undefined, collection: EntityCollection) {
  const refresh = useRefreshContent();
  return useMutation({
    mutationFn: (key: string) =>
      api(`/api/admin/content/versions/${versionId}/${collection}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }),
    onSuccess: refresh,
  });
}

export function useSaveBalance(versionId: number | undefined) {
  const refresh = useRefreshContent();
  return useMutation({
    mutationFn: (balance: BalanceSettings) =>
      api<BalanceSettings>(`/api/admin/content/versions/${versionId}/balance`, {
        method: 'PUT',
        json: balance,
      }),
    onSuccess: refresh,
  });
}

/** Message lisible d'une erreur d'API (avec la liste des usages pour IN_USE). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string; details?: unknown; issues?: unknown[] } | null;
    if (err.code === 'IN_USE' && Array.isArray(body?.details)) {
      return `Impossible de supprimer : encore utilisé par ${body.details.join(', ')}.`;
    }
    if (err.code === 'VALIDATION' && body?.issues) return 'Données invalides (voir les champs).';
    return body?.message ?? err.code;
  }
  return 'Erreur inconnue';
}
