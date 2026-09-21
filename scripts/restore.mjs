#!/usr/bin/env node
/**
 * restore — vuelve un artefacto a una version anterior desde history/.
 *
 * Sin git, history/ es la unica red de rollback del modelo. Este script es la
 * unica forma soportada de usarla: copiar a mano deja el estado, el hash y los
 * descendientes desincronizados.
 *
 * Uso:
 *   node scripts/restore.mjs <slug> <etapa>[/<item>]              -> lista versiones
 *   node scripts/restore.mjs <slug> <etapa>[/<item>] <version> --by "<nombre>"
 */

import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, copyFileSync, statSync } from 'node:fs';
import {
  ROOT, proyectoDir, leerEstado, escribirEstado, emitirEvento, sha256, rutaArtefacto,
} from '../lib/store.mjs';
import { leerEntrada, escribirEntrada, marcarStale, etapaInfo } from '../lib/cascade.mjs';

function salir(msg) { console.error(msg); process.exit(1); }

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

function main() {
  const libres = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const [slug, referencia, versionPedida] = libres;
  const quien = arg('by');

  if (!slug || !referencia) salir('Uso: node scripts/restore.mjs <slug> <etapa>[/<item>] [<version>] --by "<nombre>"');

  const [etapa, itemId = null] = referencia.split('/');
  if (!etapaInfo(etapa)) salir(`Etapa desconocida: "${etapa}".`);

  const dirHist = join(proyectoDir(slug), 'outputs', 'history', etapa, itemId ?? etapa);
  if (!existsSync(dirHist)) {
    salir(`No hay historial de "${referencia}".\nSolo se archivan las versiones aprobadas: si nunca se aprobo, no hay a que volver.`);
  }

  const versiones = readdirSync(dirHist)
    .filter((f) => /^v\d+\.md$/.test(f))
    .map((f) => ({
      n: Number(f.slice(1, -3)),
      archivo: join(dirHist, f),
      fecha: statSync(join(dirHist, f)).mtime.toISOString(),
    }))
    .sort((a, b) => a.n - b.n);

  if (!versiones.length) salir(`El historial de "${referencia}" esta vacio.`);

  const estado = leerEstado(slug);
  if (!estado) salir(`El proyecto "${slug}" no tiene estado.`);
  const entrada = leerEntrada(estado, etapa, itemId);
  const versionActual = entrada?.version ?? null;

  // --- Sin version: listar ---
  if (!versionPedida) {
    console.log(`Versiones archivadas de "${referencia}":\n`);
    for (const v of versiones) {
      const marca = v.n === versionActual ? '  <- version actual' : '';
      console.log(`  v${v.n}   ${v.fecha.slice(0, 16).replace('T', ' ')}${marca}`);
    }
    console.log(`\nPara restaurar:  node scripts/restore.mjs ${slug} ${referencia} <version> --by "<tu nombre>"`);
    return;
  }

  if (!quien) salir('Falta --by "<nombre>". Una restauracion es una decision: tiene que quedar registrada con autor.');

  const objetivo = versiones.find((v) => v.n === Number(versionPedida));
  if (!objetivo) salir(`No existe la version v${versionPedida}. Disponibles: ${versiones.map((v) => 'v' + v.n).join(', ')}.`);
  if (objetivo.n === versionActual) salir(`v${objetivo.n} ya es la version vigente. No hay nada que restaurar.`);

  const destino = rutaArtefacto(slug, etapa, itemId);
  if (!destino) salir(`No se pudo resolver la ruta de "${referencia}".`);

  const updatedAlLeer = estado.updated;

  // Archivar la version vigente antes de pisarla: restaurar no puede perder trabajo.
  if (existsSync(destino) && versionActual) {
    const respaldo = join(dirHist, `v${versionActual}.md`);
    if (!existsSync(respaldo)) copyFileSync(destino, respaldo);
  }

  copyFileSync(objetivo.archivo, destino);
  const hash = sha256(readFileSync(destino, 'utf8'));

  // La version restaurada vuelve a revision: nadie firmo ESTA restauracion.
  escribirEntrada(estado, etapa, itemId, {
    status: 'IN_REVIEW',
    version: objetivo.n,
    hash,
    approvals: {},
    pending_roles: [],
    restored_from: `v${objetivo.n}`,
    restored_at: new Date().toISOString(),
    restored_by: quien,
    stale_since: undefined,
    stale_cause: undefined,
  });

  const invalidados = marcarStale(estado, etapa, itemId, objetivo.n);

  estado.updated_by = quien;
  estado.blocked_by = null;
  estado.next_action = `Revisar y aprobar la version restaurada de ${referencia}`;
  estado.next_command = `/dsc-review`;
  escribirEstado(slug, estado, updatedAlLeer);

  emitirEvento(slug, {
    stage: etapa, item: itemId, command: '/dsc-restore', event: 'ARTIFACT_UPDATED',
    version: objetivo.n, actor: quien, restored_from: `v${objetivo.n}`,
    invalidated: invalidados.map((i) => (i.item ? `${i.etapa}/${i.item}` : i.etapa)),
  });

  console.log(`RESTAURADO — ${referencia} vuelve a v${objetivo.n}\n`);
  console.log(`  Restaurado por  ${quien}`);
  console.log(`  Version previa  v${versionActual ?? '?'} (archivada)`);
  console.log(`  Estado          IN_REVIEW — la restauracion no esta firmada por nadie`);

  if (invalidados.length) {
    console.log(`\n  ${invalidados.length} artefacto(s) quedaron OBSOLETOS:`);
    for (const i of invalidados) console.log(`    - ${i.item ? `${i.etapa}/${i.item}` : i.etapa}`);
  }

  console.log(`\nRegistra el motivo con /dsc-log y despues revisa: /dsc-review`);
}

main();
