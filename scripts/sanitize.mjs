#!/usr/bin/env node
/**
 * sanitize - CLI de lib/sanitize.mjs (SEC-02 / SEC-03).
 *
 * Paso 0 del check de seguridad de /dsc-refine: corre ANTES de que el agente
 * lea el contenido, para que un caracter invisible o una secuencia ANSI no
 * dependan de que el LLM "los vea". No reemplaza el check de inyeccion /
 * secretos de /dsc-refine - ese sigue siendo juicio del agente, sobre el
 * texto ya limpio.
 *
 * Uso:
 *   node scripts/sanitize.mjs <slug>                  sanea proyectos/<slug>/ideas/, solo reporta
 *   node scripts/sanitize.mjs <slug> --write           sanea y sobreescribe los archivos
 *   node scripts/sanitize.mjs --path <archivo-o-dir>   ruta explicita en vez de un slug
 *   algo | node scripts/sanitize.mjs -                 filtro de stdin a stdout, sin tocar disco
 *   node scripts/sanitize.mjs <slug> --json            salida en JSON
 *
 * Exit code: 0 siempre que el input se haya podido leer (esto NO es un gate
 * de aprobacion - es una utilidad determinista, igual que discovery-audit).
 * Exit 1 solo si no hay nada que leer.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { proyectoDir } from '../lib/store.mjs';
import { sanear } from '../lib/sanitize.mjs';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const posicional = argv.filter((a) => !a.startsWith('--'));
const ESCRIBIR = flags.has('--write');
const JSON_OUT = flags.has('--json');

const idxPath = argv.indexOf('--path');
const rutaExplicita = idxPath !== -1 ? argv[idxPath + 1] : null;

const modoStdin = posicional[0] === '-';

if (!modoStdin) {
  const objetivo = rutaExplicita ?? (posicional[0] ? join(proyectoDir(posicional[0]), 'ideas') : null);
  if (!objetivo) {
    console.error('Uso: node scripts/sanitize.mjs <slug|-> [--write] [--json] [--path <ruta>]');
    process.exit(1);
  }
  if (!existsSync(objetivo)) {
    console.error(`No existe: ${objetivo}`);
    process.exit(1);
  }
  correrSobreArchivos(objetivo);
} else {
  correrSobreStdin();
}

/** Lista archivos bajo `ruta`, recursivo. Si `ruta` es un archivo puntual, lo devuelve tal cual. */
function listarArchivos(ruta) {
  const st = statSync(ruta);
  if (st.isFile()) return [ruta];
  const out = [];
  for (const entry of readdirSync(ruta, { withFileTypes: true })) {
    const p = join(ruta, entry.name);
    if (entry.isDirectory()) out.push(...listarArchivos(p));
    // ideas/ no tiene extension fija: minutas, mails pegados, notas sueltas.
    else if (['.md', '.txt'].includes(extname(entry.name).toLowerCase())) out.push(p);
  }
  return out;
}

function correrSobreArchivos(objetivo) {
  const archivos = listarArchivos(objetivo);
  const reportes = archivos.map((archivo) => {
    const original = readFileSync(archivo, 'utf8');
    const { limpio, hallazgosUnicode, cantidadAnsi, tuvoHallazgos } = sanear(original);
    if (tuvoHallazgos && ESCRIBIR) writeFileSync(archivo, limpio, 'utf8');
    return { archivo, tuvoHallazgos, hallazgosUnicode, cantidadAnsi, escrito: tuvoHallazgos && ESCRIBIR };
  });

  if (JSON_OUT) {
    console.log(JSON.stringify({ archivos: reportes }, null, 2));
    return;
  }

  const conHallazgos = reportes.filter((r) => r.tuvoHallazgos);
  if (conHallazgos.length === 0) {
    console.log(`sanitize: sin hallazgos en ${archivos.length} archivo(s)`);
    return;
  }
  console.log(`sanitize: hallazgos en ${conHallazgos.length}/${archivos.length} archivo(s)\n`);
  for (const r of conHallazgos) {
    console.log(`  ${r.archivo}`);
    for (const f of r.hallazgosUnicode) console.log(`    - unicode invisible [${f.nombre}] x ${f.cantidad}`);
    if (r.cantidadAnsi > 0) console.log(`    - secuencias ANSI x ${r.cantidadAnsi}`);
    console.log(`    ${r.escrito ? '-> limpiado (--write)' : '-> solo reportado (corre con --write para limpiar)'}`);
  }
}

function correrSobreStdin() {
  const input = readFileSync(0, 'utf8');
  const { limpio, hallazgosUnicode, cantidadAnsi, tuvoHallazgos } = sanear(input);
  if (JSON_OUT) {
    console.error(JSON.stringify({ tuvoHallazgos, hallazgosUnicode, cantidadAnsi }));
  } else if (tuvoHallazgos) {
    console.error(`sanitize (stdin): unicode=${JSON.stringify(hallazgosUnicode)} ansi=${cantidadAnsi}`);
  }
  process.stdout.write(limpio);
}
