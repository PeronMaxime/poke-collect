import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorDto,
  ApiMetricsResponse,
  ApiMinuteMetricsDto,
  ApiRouteMetricsDto,
} from '@poke/shared';

/**
 * Supervision en mémoire : requêtes, erreurs et lenteurs par route, pour la page Supervision de
 * l'admin et les journaux. Rien n'est écrit en base ; un redémarrage remet tout à zéro.
 */

/** Requête plus longue que ce seuil : journalisée (route et durée). */
const SLOW_REQUEST_MS = 500;

/** Erreurs 5xx gardées en mémoire (les plus récentes). */
const KEPT_ERRORS = 50;
const MAX_MESSAGE_CHARS = 600;
const MAX_STACK_CHARS = 2000;

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** Minutes gardées en mémoire. */
const KEPT_MINUTES = 120;

/** Bornes hautes des paliers de durée (ms) ; le dernier palier n'a pas de borne. */
const BOUNDS = [25, 50, 100, 250, 500, 1000, 2500, 5000];

interface RouteStats {
  count: number;
  errors: number;
  limited: number;
  slow: number;
  totalMs: number;
  maxMs: number;
  /** Une case par borne de `BOUNDS`, plus une pour « au-delà ». */
  buckets: number[];
}

interface MinuteStats {
  requests: number;
  errors: number;
  limited: number;
  slow: number;
  totalMs: number;
  maxMs: number;
}

const emptyMinute = (): MinuteStats => ({
  requests: 0,
  errors: 0,
  limited: 0,
  slow: 0,
  totalMs: 0,
  maxMs: 0,
});

/** Total des compteurs depuis le dernier résumé (voir `takeSummary`). */
export interface MonitoringSummary {
  requests: number;
  errors: number;
  limited: number;
  slow: number;
}

/**
 * Mesures de l'API gardées en mémoire (aucune requête SQL, aucune écriture) : requêtes, erreurs 5xx,
 * refus 429 et durées par route, par minute et depuis le démarrage. Les routes sont désignées par
 * leur motif (`/api/pokemon/:id`), jamais par l'adresse réelle : rien de personnel n'y figure.
 */
export class Monitoring {
  private readonly routes = new Map<string, RouteStats>();
  private readonly minutes = new Map<number, MinuteStats>();
  private readonly startedAt: number;
  private pending: MonitoringSummary = { requests: 0, errors: 0, limited: 0, slow: 0 };
  /** De la plus ancienne à la plus récente. */
  private readonly errorLog: ApiErrorDto[] = [];

  constructor(
    private readonly clock: () => number = Date.now,
    readonly slowMs = SLOW_REQUEST_MS,
  ) {
    this.startedAt = clock();
  }

  /** Enregistre une réponse ; renvoie `true` si la requête est lente. */
  record(route: string, status: number, ms: number): boolean {
    const slow = ms >= this.slowMs;
    const error = status >= 500;
    const limited = status === 429;

    let stats = this.routes.get(route);
    if (!stats) {
      stats = {
        count: 0,
        errors: 0,
        limited: 0,
        slow: 0,
        totalMs: 0,
        maxMs: 0,
        buckets: new Array<number>(BOUNDS.length + 1).fill(0),
      };
      this.routes.set(route, stats);
    }
    stats.count += 1;
    stats.totalMs += ms;
    stats.maxMs = Math.max(stats.maxMs, ms);
    if (error) stats.errors += 1;
    if (limited) stats.limited += 1;
    if (slow) stats.slow += 1;
    const found = BOUNDS.findIndex((bound) => ms < bound);
    const bucket = found === -1 ? BOUNDS.length : found;
    stats.buckets[bucket] = (stats.buckets[bucket] ?? 0) + 1;

    const minute = this.minuteStats(Math.floor(this.clock() / 60_000));
    minute.requests += 1;
    minute.totalMs += ms;
    minute.maxMs = Math.max(minute.maxMs, ms);
    if (error) minute.errors += 1;
    if (limited) minute.limited += 1;
    if (slow) minute.slow += 1;

    this.pending.requests += 1;
    if (error) this.pending.errors += 1;
    if (limited) this.pending.limited += 1;
    if (slow) this.pending.slow += 1;
    return slow;
  }

  /**
   * Garde le détail d'une erreur 5xx (message et début de pile, tronqués) pour l'admin. Le message
   * d'une erreur SQL peut citer la requête : il n'est lisible que dans l'admin, jamais renvoyé au joueur.
   */
  recordError(route: string, status: number, err: unknown, code: string | null = null) {
    const error = err instanceof Error ? err : new Error(String(err));
    this.errorLog.push({
      at: new Date(this.clock()).toISOString(),
      route,
      status,
      name: error.name,
      code,
      message: truncate(error.message, MAX_MESSAGE_CHARS),
      stack: error.stack ? truncate(error.stack, MAX_STACK_CHARS) : null,
    });
    if (this.errorLog.length > KEPT_ERRORS)
      this.errorLog.splice(0, this.errorLog.length - KEPT_ERRORS);
  }

  private minuteStats(index: number): MinuteStats {
    let stats = this.minutes.get(index);
    if (!stats) {
      stats = emptyMinute();
      this.minutes.set(index, stats);
      for (const old of this.minutes.keys()) {
        if (old <= index - KEPT_MINUTES) this.minutes.delete(old);
      }
    }
    return stats;
  }

  /** Compteurs depuis le dernier appel (résumé journalisé chaque minute), puis remise à zéro. */
  takeSummary(): MonitoringSummary {
    const summary = this.pending;
    this.pending = { requests: 0, errors: 0, limited: 0, slow: 0 };
    return summary;
  }

  snapshot(): ApiMetricsResponse {
    const nowMs = this.clock();
    const routes: ApiRouteMetricsDto[] = [...this.routes].map(([route, s]) => ({
      route,
      count: s.count,
      errors: s.errors,
      limited: s.limited,
      slow: s.slow,
      avgMs: Math.round(s.totalMs / s.count),
      p95Ms: percentile95(s),
      maxMs: Math.round(s.maxMs),
    }));
    routes.sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count);

    const current = Math.floor(nowMs / 60_000);
    const minutes: ApiMinuteMetricsDto[] = [...this.minutes]
      .filter(([index]) => index <= current)
      .sort(([a], [b]) => a - b)
      .map(([index, m]) => ({
        at: new Date(index * 60_000).toISOString(),
        requests: m.requests,
        errors: m.errors,
        limited: m.limited,
        slow: m.slow,
        avgMs: Math.round(m.totalMs / m.requests),
        maxMs: Math.round(m.maxMs),
      }));

    const totals = routes.reduce(
      (sum, r) => ({
        requests: sum.requests + r.count,
        errors: sum.errors + r.errors,
        limited: sum.limited + r.limited,
        slow: sum.slow + r.slow,
      }),
      { requests: 0, errors: 0, limited: 0, slow: 0 },
    );
    return {
      generatedAt: new Date(nowMs).toISOString(),
      startedAt: new Date(this.startedAt).toISOString(),
      slowThresholdMs: this.slowMs,
      totals,
      routes,
      minutes,
      recentErrors: [...this.errorLog].reverse(),
    };
  }
}

/** Méthode et motif de la route d'une requête (adresses inconnues regroupées). */
export function routeLabel(method: string, pattern: string | undefined): string {
  return pattern ? `${method} ${pattern}` : `${method} (inconnue)`;
}

/** Borne haute du palier qui contient le 95e centile (plafonnée à la durée maximale vue). */
function percentile95(stats: RouteStats): number {
  const target = Math.ceil(stats.count * 0.95);
  let seen = 0;
  for (let i = 0; i < stats.buckets.length; i++) {
    seen += stats.buckets[i] ?? 0;
    if (seen < target) continue;
    const bound = BOUNDS[i];
    return bound === undefined ? Math.round(stats.maxMs) : Math.min(bound, Math.ceil(stats.maxMs));
  }
  return Math.round(stats.maxMs);
}

/**
 * Branche les mesures sur les réponses de l'API : requêtes lentes journalisées (route et durée), et,
 * chaque minute, un résumé s'il y a eu des refus 429, des erreurs 5xx ou des lenteurs. Les requêtes
 * réussies et rapides ne sont plus journalisées (voir `disableRequestLogging` dans `buildApp`).
 */
export function registerMonitoring(
  app: FastifyInstance,
  monitoring: Monitoring,
  summaryEveryMs = 60_000,
) {
  app.addHook('onResponse', async (request, reply) => {
    // Adresses inconnues (404) regroupées : pas de route inventée par un robot.
    const route = routeLabel(request.method, request.routeOptions.url);
    const ms = reply.elapsedTime;
    if (monitoring.record(route, reply.statusCode, ms)) {
      request.log.warn({ route, status: reply.statusCode, ms: Math.round(ms) }, 'Requête lente');
    }
  });

  const timer = setInterval(() => {
    const summary = monitoring.takeSummary();
    if (summary.limited > 0 || summary.errors > 0 || summary.slow > 0) {
      app.log.warn(summary, 'Dernière minute : refus 429, erreurs 5xx ou requêtes lentes');
    }
  }, summaryEveryMs);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
