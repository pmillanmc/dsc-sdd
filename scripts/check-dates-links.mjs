#!/usr/bin/env node
/**
 * check-dates-links - CLI de lib/check-dates-links.mjs.
 *
 * Revisa fechas y links en borradores de ideas/. Corre DESPUES de sanitize:
 * aplica sanear() en memoria sobre cada archivo antes de analizar, para que
 * Unicode invisible o ANSI no distorsionen el texto. No reemplaza el check
 * de inyeccion/secretos de /dsc-refine.
 *
 * No escribe en disco. No abre red. Solo lee y reporta.
 *
 * Uso:
 *   node scripts/check-dates-links.mjs <slug>                 revisa proyectos/<slug>/ideas/
 *   node scripts/check-dates-links.mjs --path <archivo-o-dir> ruta explicita
 *   node scripts/check-dates-links.mjs <slug> --json          salida JSON
 *
 * Exit code: 0 siempre que el input se haya podido leer (avisa, no frena —
 * utilitario determinista, igual que sanitize / discovery-audit).
 * Exit 1 solo si falta el argumento o no hay nada que leer.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { proyectoDir } from '../lib/store.mjs';
import { sanear } from '../lib/sanitize.mjs';
import { analizarArchivo } from '../lib/check-dates-links.mjs';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--') && a !== '--path'));
const JSON_OUT = flags.has('--json');

const idxPath = argv.indexOf('--path');
const rutaExplicita = idxPath !== -1 ? argv[idxPath + 1] : null;
// Si no hay --path, idxPath es -1: no hay que excluir el indice 0 (el slug).
const posicional = argv.filter((a, i) => {
  if (a.startsWith('--')) return false;
  if (idxPath !== -1 && i === idxPath + 1) return false;
  return true;
});

const objetivo = rutaExplicita ?? (posicional[0] ? join(proyectoDir(posicional[0]), 'ideas') : null);
if (!objetivo) {
  console.error('Uso: node scripts/check-dates-links.mjs <slug> [--json] [--path <ruta>]');
  process.exit(1);
}
if (!existsSync(objetivo)) {
  console.error(`No existe: ${objetivo}`);
  process.exit(1);
}

const IGNORAR = new Set(['leeme.md', '.gitkeep']);

/** Lista archivos bajo `ruta`, recursivo. Si `ruta` es un archivo, lo devuelve. */
function listarArchivos(ruta) {
  const st = statSync(ruta);
  if (st.isFile()) return [ruta];
  const out = [];
  for (const entry of readdirSync(ruta, { withFileTypes: true })) {
    const p = join(ruta, entry.name);
    if (entry.isDirectory()) out.push(...listarArchivos(p));
    else if (!IGNORAR.has(entry.name.toLowerCase())) out.push(p);
  }
  return out;
}

const archivos = listarArchivos(objetivo);
if (!archivos.length) {
  console.error(`No hay archivos para revisar en: ${objetivo}`);
  process.exit(1);
}

const resultados = archivos
  .map((archivo) => {
    const crudo = readFileSync(archivo, 'utf8');
    return analizarArchivo(archivo, crudo, sanear);
  })
  .sort((a, b) => String(a.archivo).localeCompare(String(b.archivo)));

const porArchivoLinea = (a, b) =>
  String(a.archivo).localeCompare(String(b.archivo))
  || (Number(a.linea) - Number(b.linea))
  || String(a.tipo ?? '').localeCompare(String(b.tipo ?? ''));

const hallazgos = resultados.flatMap((r) => r.hallazgos).sort(porArchivoLinea);
const fechas = resultados.flatMap((r) => r.fechas).sort(porArchivoLinea);
const links = resultados.flatMap((r) => r.links).sort(porArchivoLinea);
const conHallazgos = new Set(hallazgos.map((x) => x.archivo));

if (JSON_OUT) {
  console.log(JSON.stringify({
    archivos: resultados.map((r) => ({
      archivo: r.archivo,
      fechaDocumento: r.fechaDocumento,
      analizado: r.analizado,
    })),
    hallazgos,
    fechas,
    links,
  }, null, 2));
  process.exit(0);
}

const resumen =
  `check-dates-links: ${hallazgos.length} hallazgo(s) en ${conHallazgos.size} archivo(s), ` +
  `${fechas.length} fechas y ${links.length} links encontrados`;
console.log(resumen);

if (!hallazgos.length) process.exit(0);

const porArchivo = new Map();
for (const x of hallazgos) {
  if (!porArchivo.has(x.archivo)) porArchivo.set(x.archivo, []);
  porArchivo.get(x.archivo).push(x);
}

console.log('');
for (const [archivo, lista] of porArchivo) {
  console.log(`  ${archivo}`);
  for (const x of lista) {
    console.log(`    L${x.linea} [${x.severidad}] ${x.tipo}: ${x.mensaje}`);
    console.log(`      -> ${x.hint}`);
  }
  console.log('');
}

process.exit(0);
