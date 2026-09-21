#!/usr/bin/env node
/**
 * gen-estado — unico proyector de estado.json.
 *
 * Escribe la foto que Discovery publica hacia afuera. Es un proyector: no
 * valida, no bloquea, no sale a la red. Decide QUE se publica; el transporte
 * —quien lo manda y adonde— es otro problema y vive en otro lado.
 *
 * La separacion importa: el dia que el destino pase de un archivo a un endpoint,
 * este script no cambia.
 *
 * Uso:
 *   node scripts/gen-estado.mjs <slug>             escribe metrics/estado.json
 *   node scripts/gen-estado.mjs <slug> --stdout    lo imprime, no escribe
 *   node scripts/gen-estado.mjs <slug> --base F001 la linea base de una feature
 *
 * Sin slug lista los proyectos disponibles en vez de adivinar: correrlo sobre el
 * proyecto equivocado publica la foto de otro cliente.
 */

import { join } from 'node:path';
import { writeJson, metricsDir } from '../lib/store.mjs';
import { leerProyectos } from '../lib/registry.mjs';
import { planVigente, lineaBase, avisos } from '../lib/publicable.mjs';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf('--' + n);
  return i === -1 ? null : (args[i + 1] ?? '');
};
const tiene = (n) => args.includes('--' + n);
const slug = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--base');

function salir(msg) {
  console.error(msg);
  process.exit(1);
}

if (!slug) {
  const disponibles = leerProyectos().map((p) => '  ' + p.slug + '  (' + p.id + ')');
  salir(
    'Falta el slug del proyecto.\n\n' +
    'Uso: node scripts/gen-estado.mjs <slug> [--stdout] [--base F001]\n\n' +
    (disponibles.length ? 'Proyectos:\n' + disponibles.join('\n') : 'No hay proyectos todavia.')
  );
}

const base = flag('base');
const obj = base ? lineaBase(slug, base) : planVigente(slug);

if (!obj) salir('No existe la feature ' + base + ' en el proyecto ' + slug + '.');

if (tiene('stdout')) {
  console.log(JSON.stringify(obj, null, 2));
  process.exit(0);
}

// La linea base es inmutable y va por feature y version: un archivo por cada
// una, para que publicar la v2 no pise la v1 en disco igual que no la pisa en
// destino.
const nombre = base
  ? join('base', base + '-v' + obj.clave.version + '.json')
  : 'estado.json';
const destino = join(metricsDir(slug), nombre);

writeJson(destino, obj);

const rel = destino.replace(/\\/g, '/').split('/proyectos/')[1];
console.log((base ? 'Linea base' : 'Plan vigente') + ' — ' + slug);
console.log('  Archivo   proyectos/' + rel);
if (!base) {
  console.log('  Features  ' + obj.features.length);
  console.log('  Epicas    ' + obj.roadmap.epicas.length);
}

const av = avisos(obj);
if (av.length) {
  console.log('');
  for (const a of av) console.log('  aviso: ' + a);
}
