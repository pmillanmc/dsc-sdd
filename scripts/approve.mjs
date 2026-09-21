#!/usr/bin/env node
/**
 * approve — registra UNA firma de UN rol sobre un artefacto.
 *
 * Es un script y no una secuencia de escrituras del agente por dos razones:
 * la transaccion de aprobacion tiene que ser atomica (archivar, hashear, marcar,
 * invalidar descendientes) y el modelo NUNCA debe poder firmar por su cuenta.
 * Aca la firma llega por argumento: siempre la origina una persona.
 *
 * Cuando firman todos los roles `required` de config/review-policy.yaml, el
 * artefacto pasa a APPROVED y se dispara la cascada STALE.
 *
 * Uso:
 *   node scripts/approve.mjs <slug> <etapa>[/<item>] --as "<rol>" --by "<nombre>"
 *                            [--verdict approved|rejected] [--comment "<texto>"]
 *
 * Ejemplos:
 *   node scripts/approve.mjs stock vision --as "Product Owner" --by "Ana Gomez"
 *   node scripts/approve.mjs stock features/F001 --as "QA" --by "Luis Paz"
 *   node scripts/approve.mjs stock roadmap --as "Product Owner" --by "Ana" --verdict rejected
 */

import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import {
  ROOT, proyectoDir, leerEstado, escribirEstado, emitirEvento,
  writeAtomic, sha256, readYaml, writeYaml, rutaArtefacto,
} from '../lib/store.mjs';
import {
  rolesRequeridos, leerEntrada, escribirEntrada, marcarStale, etapaInfo,
} from '../lib/cascade.mjs';

function salir(msg) { console.error(msg); process.exit(1); }

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

/** Archiva la version aprobada. Sin git, history/ es la unica red de rollback. */
function archivar(slug, etapa, itemId, version, origen) {
  const id = itemId ?? etapa;
  const dir = join(proyectoDir(slug), 'outputs', 'history', etapa, id);
  mkdirSync(dir, { recursive: true });
  const destino = join(dir, `v${version}.md`);
  copyFileSync(origen, destino);
  return destino;
}

function main() {
  const [slug, referencia] = process.argv.slice(2).filter((a) => !a.startsWith('--')).slice(0, 2);
  const rol = arg('as');
  const quien = arg('by');
  const veredicto = (arg('verdict') ?? 'approved').toLowerCase();
  const comentario = arg('comment');

  if (!slug || !referencia) salir('Uso: node scripts/approve.mjs <slug> <etapa>[/<item>] --as "<rol>" --by "<nombre>"');
  if (!rol) salir('Falta --as "<rol>". La firma tiene que declarar en nombre de que rol se da.');
  if (!quien) salir('Falta --by "<nombre>". Una firma sin persona identificada no es una firma.');
  if (!['approved', 'rejected'].includes(veredicto)) salir('--verdict tiene que ser approved o rejected.');

  const [etapa, itemId = null] = referencia.split('/');
  if (!etapaInfo(etapa)) salir(`Etapa desconocida: "${etapa}".`);

  const estado = leerEstado(slug);
  if (!estado) salir(`El proyecto "${slug}" no tiene estado. Corre /dsc-new o /dsc-status.`);
  const updatedAlLeer = estado.updated;

  const entrada = leerEntrada(estado, etapa, itemId);
  if (!entrada) salir(`No hay nada que aprobar en "${referencia}": la etapa no fue generada todavia.`);
  if (entrada.status === 'APPROVED') {
    salir(
      `"${referencia}" ya esta aprobado.\n` +
      `Para cambiarlo, reabrilo primero:  node scripts/reabrir.mjs ${slug} ${referencia} --motivo "..." --by "${quien}"\n` +
      `Si el cambio contradice a un antecesor, no es un ajuste: regeneralo con el comando de su etapa.`
    );
  }
  if (entrada.status === 'STALE') salir(`"${referencia}" esta STALE (${entrada.stale_cause}). Regeneralo antes de aprobar.`);

  const { required, optional } = rolesRequeridos(etapa);
  if (!required.includes(rol) && !optional.includes(rol)) {
    salir(
      `El rol "${rol}" no figura en la politica de "${etapa}".\n` +
      `Requeridos: ${required.join(', ') || 'ninguno'}. Opcionales: ${optional.join(', ') || 'ninguno'}.\n` +
      `Si el rol es correcto, agregalo a config/review-policy.yaml.`
    );
  }

  const firmas = entrada.approvals ?? {};
  if (firmas[rol]) salir(`"${rol}" ya firmo este artefacto (${firmas[rol].by}, ${firmas[rol].at}).`);

  const ahora = new Date().toISOString();
  firmas[rol] = { by: quien, at: ahora, verdict: veredicto, comment: comentario };

  // --- Rechazo: el flujo se detiene ---
  if (veredicto === 'rejected') {
    escribirEntrada(estado, etapa, itemId, { status: 'REJECTED', approvals: firmas });
    estado.blocked_by = `${referencia} rechazado por ${rol} (${quien})`;
    estado.next_action = `Replantear ${referencia}. Ningun comando posterior puede avanzar.`;
    estado.next_command = `/dsc-log`;
    estado.updated_by = quien;
    escribirEstado(slug, estado, updatedAlLeer);
    emitirEvento(slug, { stage: etapa, item: itemId, command: '/dsc-approve', event: 'APPROVAL_REJECTED', actor: quien, role: rol });
    console.log(`RECHAZADO — ${referencia}\n\n${quien} (${rol}) rechazo el artefacto.`);
    if (comentario) console.log(`Motivo: ${comentario}`);
    console.log(`\nEl workflow esta detenido. Registra la decision con /dsc-log y replantea el artefacto.`);
    return;
  }

  // --- Firma parcial: faltan roles ---
  const faltan = required.filter((r) => !firmas[r] || firmas[r].verdict !== 'approved');
  if (faltan.length) {
    escribirEntrada(estado, etapa, itemId, { status: 'AWAITING_APPROVAL', approvals: firmas, pending_roles: faltan });
    estado.next_action = `Falta la firma de: ${faltan.join(', ')}`;
    estado.next_command = `/dsc-approve ${referencia} --as "${faltan[0]}"`;
    estado.updated_by = quien;
    escribirEstado(slug, estado, updatedAlLeer);
    emitirEvento(slug, { stage: etapa, item: itemId, command: '/dsc-approve', event: 'APPROVAL_GRANTED', actor: quien, role: rol, complete: false });
    console.log(`Firma registrada: ${quien} (${rol}).\n\nTodavia falta: ${faltan.join(', ')}.`);
    console.log(`Proximo paso: /dsc-approve ${referencia} --as "${faltan[0]}"`);
    return;
  }

  // --- Transaccion de aprobacion ---
  // Los cinco pasos ocurren juntos o no ocurre ninguno: un estado a medias
  // (APPROVED sin archivar, o archivado sin invalidar descendientes) es peor
  // que no haber aprobado.
  const ruta = rutaArtefacto(slug, etapa, itemId);
  if (!ruta || !existsSync(ruta)) {
    salir(`El estado dice que "${referencia}" existe, pero no se encuentra el archivo.\nNo se aprueba nada hasta resolverlo.`);
  }

  const contenido = readFileSync(ruta, 'utf8');
  const version = entrada.version ?? 1;

  const archivo = archivar(slug, etapa, itemId, version, ruta);
  const hash = sha256(contenido);

  escribirEntrada(estado, etapa, itemId, {
    status: 'APPROVED',
    version,
    hash,
    approved_at: ahora,
    approvals: firmas,
    pending_roles: [],
    stale_since: undefined,
    stale_cause: undefined,
  });

  const invalidados = marcarStale(estado, etapa, itemId, version);

  estado.blocked_by = null;
  estado.updated_by = quien;
  const info = etapaInfo(etapa);
  estado.next_action = invalidados.length
    ? `Regenerar ${invalidados.length} artefacto(s) que quedaron obsoletos`
    : `Continuar con la etapa siguiente`;
  estado.next_command = invalidados.length
    ? (etapaInfo(invalidados[0].etapa)?.command ?? '/dsc-status')
    : '/dsc-status';

  escribirEstado(slug, estado, updatedAlLeer);

  emitirEvento(slug, {
    stage: etapa, item: itemId, command: '/dsc-approve', event: 'APPROVAL_GRANTED',
    actor: quien, role: rol, complete: true, version, hash,
  });
  emitirEvento(slug, {
    stage: etapa, item: itemId, command: '/dsc-approve', event: 'STAGE_COMPLETED',
    version, invalidated: invalidados.map((i) => (i.item ? `${i.etapa}/${i.item}` : i.etapa)),
  });

  // Registro del hash tambien en registry/features.yaml, para el check de drift
  if (etapa === 'features' && itemId) {
    const p = join(ROOT, 'registry', 'features.yaml');
    const reg = readYaml(p, { features: [] });
    const f = (reg.features ?? []).find((x) => x.id === itemId && x.proyecto === slug);
    if (f) {
      // Una feature ya entregada no vuelve a "APPROVED" al re-firmarse: sigue
      // entregada, y ademas hay que reenviarla. Pisar el estado borraria el
      // unico dato que dice que existe codigo construyendose sobre esta feature,
      // y con eso se cae la guarda de handoff.mjs que bloquea la reentrega.
      if (f.status === 'HANDED_OFF') f.redelivery_pending = true;
      else f.status = 'APPROVED';
      f.hash = hash;
      f.version = version;
      writeYaml(p, reg);
    }
  }

  console.log(`APROBADO — ${referencia} v${version}\n`);
  console.log(`  Firmas    ${Object.entries(firmas).map(([r, f]) => `${f.by} (${r})`).join(', ')}`);
  console.log(`  Archivado ${archivo.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
  console.log(`  Hash      ${hash.slice(0, 22)}...`);

  if (invalidados.length) {
    console.log(`\n  ${invalidados.length} artefacto(s) quedaron OBSOLETOS y hay que regenerarlos:`);
    for (const i of invalidados) console.log(`    - ${i.item ? `${i.etapa}/${i.item}` : i.etapa}`);
  }

  console.log(`\nProximo paso: ${estado.next_command}`);
}

try { main(); } catch (e) { salir(e.message); }
