/**
 * cascade — el grafo de la cadena y la propagacion de STALE.
 *
 * Aprobar la version n+1 de un artefacto invalida todo lo que se construyo sobre
 * la version n. Sin esto, cambiar la vision con veinte features ya definidas deja
 * el modelo internamente inconsistente y nadie se entera hasta desarrollo.
 *
 * Ver contracts/chain.md.
 */

import { join } from 'node:path';
import { ROOT, readYaml, leerEstado, escribirEstado, emitirEvento } from './store.mjs';

/** Etapas en orden, desde config/workflow.yaml. La cadena no esta hardcodeada. */
export function ordenEtapas() {
  const wf = readYaml(join(ROOT, 'config', 'workflow.yaml'));
  if (!wf?.workflow?.length) throw new Error('config/workflow.yaml no declara etapas.');
  return wf.workflow.map((e) => e.id);
}

export function etapaInfo(id) {
  const wf = readYaml(join(ROOT, 'config', 'workflow.yaml'));
  return wf.workflow.find((e) => e.id === id) ?? null;
}

/** Etapas posteriores a una dada. El subarbol que una aprobacion invalida. */
export function descendientes(etapa) {
  const orden = ordenEtapas();
  const i = orden.indexOf(etapa);
  if (i === -1) throw new Error(`Etapa desconocida: "${etapa}". Validas: ${orden.join(', ')}`);
  return orden.slice(i + 1);
}

/** Etapas con artefactos multiples: cada item se aprueba por separado. */
export const ETAPAS_CON_ITEMS = new Set(['release', 'features', 'estimation', 'handoff']);

/** Mapeo etapa -> clave de config/review-policy.yaml. */
const POLITICA = {
  iniciativa: 'iniciativa',
  vision: 'vision',
  roadmap: 'roadmap',
  release: 'release',
  features: 'feature',
};

/** Roles que deben firmar. Vacio = la etapa no requiere aprobacion humana. */
export function rolesRequeridos(etapa) {
  const clave = POLITICA[etapa];
  if (!clave) return { required: [], optional: [] };
  const pol = readYaml(join(ROOT, 'config', 'review-policy.yaml'), {});
  const revisores = pol[clave]?.reviewers ?? [];
  return {
    required: revisores.filter((r) => r.approval === 'required').map((r) => r.role),
    optional: revisores.filter((r) => r.approval === 'optional').map((r) => r.role),
  };
}

/** Estado de una etapa o de un item dentro de ella. */
export function leerEntrada(estado, etapa, itemId = null) {
  const s = estado.stages?.[etapa];
  if (!s) return null;
  if (!itemId) return s;
  return s.items?.[itemId] ?? null;
}

export function escribirEntrada(estado, etapa, itemId, valor) {
  estado.stages ??= {};
  const s = (estado.stages[etapa] ??= { status: 'PENDING' });
  if (!itemId) {
    Object.assign(s, valor);
    return s;
  }
  s.items ??= {};
  s.items[itemId] = { ...(s.items[itemId] ?? {}), ...valor };
  s.status = estadoDerivado(s);
  return s.items[itemId];
}

/**
 * Marca el inicio de una etapa: emite `STAGE_STARTED` y persiste `started_at` en
 * el estado, en una sola llamada.
 *
 * Van juntos a proposito. El evento solo vive en `events.jsonl`, que es append-only
 * y hay que recorrer entero para saber cuando empezo algo; el estado es lo que leen
 * `/dsc-status` y el tablero. Cuando un comando emitia el evento y no escribia el
 * estado, la fecha existia y nadie la veia.
 *
 * `started_at` es de la version en curso: regenerar una etapa lo resetea. El
 * historico completo queda en `events.jsonl`, que nunca se reescribe. Ver DEC-009.
 *
 * Devuelve el timestamp escrito, o `null` si el proyecto no tiene estado todavia.
 */
export function marcarInicio(proyecto, etapa, { itemId = null, actor = null, command = null } = {}) {
  const estado = leerEstado(proyecto);
  if (!estado) return null;

  const ahora = new Date().toISOString();
  escribirEntrada(estado, etapa, itemId, {
    status: 'IN_PROGRESS',
    started_at: ahora,
    started_by: actor,
  });
  if (actor) estado.updated_by = actor;
  escribirEstado(proyecto, estado);
  emitirEvento(proyecto, { stage: etapa, item: itemId, command, event: 'STAGE_STARTED', actor });
  return ahora;
}

/**
 * El estado de una etapa con items se deriva de ellos: no se declara a mano.
 * Basta un item bloqueado para que la etapa entera no habilite la siguiente.
 */
export function estadoDerivado(stage) {
  // Los items SUPERSEDED estan retirados (una feature dividida queda asi): no
  // participan del estado de la etapa. Sin este filtro, una division dejaria la
  // etapa en PENDING para siempre, porque `every(APPROVED)` fallaria aunque todas
  // las features vivas esten aprobadas.
  const items = Object.values(stage.items ?? {}).filter((i) => i.status !== 'SUPERSEDED');
  if (!items.length) return stage.status ?? 'PENDING';
  const hay = (s) => items.some((i) => i.status === s);
  if (hay('REJECTED')) return 'REJECTED';
  if (hay('FAILED')) return 'FAILED';
  if (hay('STALE')) return 'STALE';
  if (hay('CHANGES_REQUESTED')) return 'CHANGES_REQUESTED';
  if (hay('AWAITING_APPROVAL')) return 'AWAITING_APPROVAL';
  if (hay('IN_REVIEW')) return 'IN_REVIEW';
  if (hay('IN_PROGRESS')) return 'IN_PROGRESS';
  if (items.every((i) => i.status === 'APPROVED')) return 'APPROVED';
  return 'PENDING';
}

/**
 * Que quedaria STALE si se aprueba una version nueva de `etapa`.
 * Solo se invalida lo que estaba APPROVED: lo PENDING sigue PENDING.
 *
 * No muta el estado — /dsc-impact lo usa para mostrar el costo del cambio
 * ANTES de confirmarlo.
 */
export function calcularImpacto(estado, etapa, itemId = null) {
  const causa = itemId ? `${etapa}/${itemId}` : etapa;
  const afectados = [];

  for (const desc of descendientes(etapa)) {
    const s = estado.stages?.[desc];
    if (!s) continue;

    const items = s.items ? Object.entries(s.items) : [];
    if (items.length) {
      for (const [id, item] of items) {
        if (item.status === 'APPROVED') {
          afectados.push({ etapa: desc, item: id, estado_previo: item.status, causa });
        }
      }
    } else if (s.status === 'APPROVED') {
      afectados.push({ etapa: desc, item: null, estado_previo: s.status, causa });
    }
  }

  return { causa, afectados };
}

/** Aplica la invalidacion. Devuelve lo que marco, para registrarlo en el evento. */
export function marcarStale(estado, etapa, itemId = null, version = null) {
  const causa = `${itemId ? `${etapa}/${itemId}` : etapa} v${version ?? '?'}`;
  const { afectados } = calcularImpacto(estado, etapa, itemId);
  const ahora = new Date().toISOString();

  for (const a of afectados) {
    const destino = a.item
      ? estado.stages[a.etapa].items[a.item]
      : estado.stages[a.etapa];
    destino.status = 'STALE';
    destino.stale_since = ahora;
    destino.stale_cause = causa;
  }

  for (const desc of descendientes(etapa)) {
    const s = estado.stages?.[desc];
    if (s?.items) s.status = estadoDerivado(s);
  }

  return afectados.map((a) => ({ ...a, causa }));
}

/** Una etapa habilita a la siguiente solo si esta APPROVED y no STALE. */
export function habilitaSiguiente(estado, etapa) {
  const s = estado.stages?.[etapa];
  if (!s) return { ok: false, razon: 'no existe' };
  const status = s.items ? estadoDerivado(s) : s.status;
  if (status === 'APPROVED') return { ok: true };
  if (status === 'STALE') return { ok: false, razon: `esta STALE (${s.stale_cause ?? 'causa no registrada'})` };
  return { ok: false, razon: `esta en ${status}` };
}
