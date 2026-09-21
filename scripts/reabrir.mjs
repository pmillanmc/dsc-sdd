#!/usr/bin/env node
/**
 * reabrir — devuelve un artefacto aprobado a revision, para poder cambiarlo.
 *
 * Es la unica pieza que le faltaba al modelo para soportar cambios sobre algo ya
 * firmado. Todo lo demas ya existia: `marcarStale` invalida descendientes,
 * `approve.mjs` recalcula el hash al volver a firmar, `history/` guarda cada
 * version, y el chequeo 12 del audit ya saltea lo que no esta APPROVED.
 *
 * Lo que faltaba era la transicion. Sin ella, editar un artefacto aprobado lo deja
 * en APPROVED con contenido que nadie firmo — que es exactamente lo que paso con
 * seis features de proyecto-1, y nadie se entero por meses.
 *
 * Este script NO edita el documento: eso es criterio y lo hace una persona (o el
 * agente, a pedido). Aca solo se mueve el estado, de forma atomica.
 *
 * Se corre ANTES de editar. Despues del cambio el ciclo es el de siempre:
 * /dsc-review y /dsc-approve.
 *
 * Uso:
 *   node scripts/reabrir.mjs <slug> <etapa>[/<item>] --motivo "<texto>" --by "<nombre>"
 */

import { existsSync } from 'node:fs';
import { leerEstado, escribirEstado, emitirEvento, rutaArtefacto } from '../lib/store.mjs';
import { leerEntrada, escribirEntrada, marcarStale, etapaInfo } from '../lib/cascade.mjs';

function salir(msg) { console.error(msg); process.exit(1); }

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

function main() {
  const [slug, referencia] = process.argv.slice(2).filter((a) => !a.startsWith('--')).slice(0, 2);
  const motivo = arg('motivo');
  const quien = arg('by');

  if (!slug || !referencia) {
    salir('Uso: node scripts/reabrir.mjs <slug> <etapa>[/<item>] --motivo "<texto>" --by "<nombre>"');
  }
  if (!motivo) salir('Falta --motivo "<texto>". Reabrir algo firmado sin decir por que no deja rastro de nada.');
  if (!quien) salir('Falta --by "<nombre>". Un cambio sobre algo aprobado tiene autor.');

  const [etapa, itemId = null] = referencia.split('/');
  if (!etapaInfo(etapa)) salir(`Etapa desconocida: "${etapa}".`);

  const estado = leerEstado(slug);
  if (!estado) salir(`El proyecto "${slug}" no tiene estado. Corre /dsc-status.`);
  const updatedAlLeer = estado.updated;

  const entrada = leerEntrada(estado, etapa, itemId);
  if (!entrada) salir(`"${referencia}" no fue generado todavia: no hay nada que reabrir.`);

  if (entrada.status !== 'APPROVED') {
    salir(
      `"${referencia}" no esta aprobado (esta en ${entrada.status}), asi que no hace falta reabrirlo.\n` +
      `Editalo y segui con /dsc-review.`
    );
  }

  const ruta = rutaArtefacto(slug, etapa, itemId);
  if (!ruta || !existsSync(ruta)) {
    salir(`El estado dice que "${referencia}" existe, pero no se encuentra el archivo.\nNo se toca el estado hasta resolverlo.`);
  }

  const version = (entrada.version ?? 1) + 1;
  const ahora = new Date().toISOString();

  // El hash NO se toca: sigue siendo el de la version firmada, que es lo que el
  // chequeo 12 compara. Como el estado deja de ser APPROVED, ese chequeo saltea
  // el artefacto solo, y approve.mjs recalcula el hash al volver a firmar.
  escribirEntrada(estado, etapa, itemId, {
    status: 'IN_REVIEW',
    version,
    approved_at: undefined,
    approvals: {},
    pending_roles: [],
    reopened_at: ahora,
    reopened_by: quien,
    reopened_reason: motivo,
    stale_since: undefined,
    stale_cause: undefined,
  });

  const invalidados = marcarStale(estado, etapa, itemId, version);

  estado.updated_by = quien;
  estado.blocked_by = null;
  estado.next_action = `Editar ${referencia} y volver a revisarlo`;
  estado.next_command = '/dsc-review';
  escribirEstado(slug, estado, updatedAlLeer);

  emitirEvento(slug, {
    stage: etapa, item: itemId, command: '/dsc-change', event: 'ARTIFACT_UPDATED',
    version, actor: quien, reason: motivo, was_approved: true,
    invalidated: invalidados.map((i) => (i.item ? `${i.etapa}/${i.item}` : i.etapa)),
  });

  console.log(`REABIERTO — ${referencia} pasa a v${version}\n`);
  console.log(`  Reabierto por  ${quien}`);
  console.log(`  Motivo         ${motivo}`);
  console.log(`  Estado         IN_REVIEW — la version anterior sigue firmada en history/`);
  console.log(`  Archivo        ${ruta.split(/[\\/]/).slice(-1)[0]}`);

  if (invalidados.length) {
    console.log(`\n  ${invalidados.length} artefacto(s) quedaron OBSOLETOS:`);
    for (const i of invalidados) console.log(`    - ${i.item ? `${i.etapa}/${i.item}` : i.etapa}`);
    console.log(`\n  Si esa lista te sorprende, el cambio es mas grande de lo que parecia:`);
    console.log(`  puede convenir regenerar desde arriba en vez de parchear aca.`);
  }

  console.log(`\nAhora edita el artefacto. Despues: /dsc-review, y /dsc-log para registrar el motivo.`);
}

main();
