/**
 * store — acceso a disco del Discovery Model.
 *
 * Concentra tres cosas que el resto del modelo no debe reimplementar:
 *   1. escritura atomica con reintento (OneDrive puede tener el archivo tomado)
 *   2. reserva de IDs contra registry/ids.yaml (ver contracts/ids.md)
 *   3. append a events.jsonl (ver contracts/state.md)
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from './yaml-min.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const proyectoDir = (slug) => join(ROOT, 'proyectos', slug);
export const metricsDir = (slug) => join(proyectoDir(slug), 'metrics');

/**
 * Ruta del artefacto de una etapa. Es la version en codigo de contracts/paths.md:
 * sin esto no se puede archivar, hashear ni reabrir un artefacto.
 *
 * Las features se resuelven por prefijo porque el nombre del archivo incluye el
 * slug (`F001-canal-whatsapp.md`) y el llamador solo conoce el ID.
 *
 * Devuelve `null` cuando la etapa no tiene un archivo propio (handoff) o cuando
 * la carpeta de features todavia no existe. Quien llama decide si eso es un error.
 *
 * Vive aca y no en cada script porque la usan approve, restore y reabrir: con una
 * copia por consumidor, mover un artefacto deja a alguno leyendo la ruta vieja.
 */
export function rutaArtefacto(slug, etapa, itemId = null) {
  const base = proyectoDir(slug);
  switch (etapa) {
    case 'iniciativa': return join(base, 'iniciativa.md');
    case 'vision':     return join(base, 'outputs', 'vision', 'vision.md');
    case 'roadmap':    return join(base, 'outputs', 'roadmap', 'roadmap.md');
    case 'release':    return join(base, 'outputs', 'releases', `${itemId}.md`);
    case 'estimation': return join(base, 'outputs', 'estimations', `${itemId}.md`);
    case 'features': {
      const dir = join(base, 'outputs', 'features');
      if (!existsSync(dir)) return null;
      const f = readdirSync(dir).find((n) => n.startsWith(`${itemId}-`));
      return f ? join(dir, f) : null;
    }
    default: return null;
  }
}

/** Escritura atomica: .tmp + rename, con un reintento. OneDrive bloquea archivos al sincronizar. */
export function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  for (let intento = 0; intento < 2; intento++) {
    try {
      writeFileSync(tmp, content, 'utf8');
      renameSync(tmp, path);
      return;
    } catch (err) {
      if (intento === 1) {
        throw new Error(
          `No se pudo escribir "${path}". Si la carpeta esta sincronizando, ` +
          `espera unos segundos y reintenta. Causa: ${err.message}`
        );
      }
    }
  }
}

export function readYaml(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return parse(readFileSync(path, 'utf8'));
}

export function writeYaml(path, value) {
  writeAtomic(path, stringify(value));
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  writeAtomic(path, JSON.stringify(value, null, 2) + '\n');
}

export const sha256 = (text) => 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Reserva IDs de forma atomica. Releer -> incrementar -> escribir, en el mismo turno.
 * Nunca contar archivos: con dos personas en paralelo, ambas ven lo mismo y colisionan.
 */
/**
 * Migracion de DEC-007. Los contadores por proyecto vivian bajo la clave
 * "products", del vocabulario anterior a DEC-003.
 *
 * No alcanza con renombrar la clave y seguir: un ids.yaml que se haya quedado
 * con el nombre viejo se leeria como "sin contadores", y la proxima reserva
 * devolveria F001 para un proyecto que ya tiene ocho features. Por eso se
 * fusiona en vez de ignorarse, y se borra la clave vieja para que el proximo
 * writeYaml deje el archivo migrado.
 */
export function normalizarContadores(reg) {
  if (reg.products) {
    reg.proyectos = { ...(reg.proyectos ?? {}), ...reg.products };
    delete reg.products;
  }
  return reg;
}

export function reservarIds(tipo, proyecto, cantidad = 1) {
  const path = join(ROOT, 'registry', 'ids.yaml');
  const reg = normalizarContadores(readYaml(path, { global: {}, proyectos: {} }));

  const globales = ['PRY', 'DEC'];
  const esGlobal = globales.includes(tipo);
  const bucket = esGlobal
    ? (reg.global ??= {})
    : ((reg.proyectos ??= {})[proyecto] ??= {});

  const ultimo = bucket[tipo] ?? 0;
  const ids = [];
  for (let i = 1; i <= cantidad; i++) ids.push(formatearId(tipo, ultimo + i));
  bucket[tipo] = ultimo + cantidad;

  writeYaml(path, reg);
  return ids;
}

const ANCHO = { PRY: 3, DEC: 3, OE: 3, EP: 3, F: 3, CHK: 3, FB: 3, U: 2, BC: 2, R: 0 };
const CON_GUION = new Set(['PRY', 'DEC', 'OE', 'FB']);

export function formatearId(tipo, n) {
  const ancho = ANCHO[tipo] ?? 3;
  const num = ancho ? String(n).padStart(ancho, '0') : String(n);
  return CON_GUION.has(tipo) ? `${tipo}-${num}` : `${tipo}${num}`;
}

/** Append a events.jsonl. Nunca reescribe ni trunca: es la base de todas las metricas. */
export function emitirEvento(proyecto, evento) {
  const dir = metricsDir(proyecto);
  mkdirSync(dir, { recursive: true });
  const linea = JSON.stringify({ ts: new Date().toISOString(), ...evento }) + '\n';
  appendFileSync(join(dir, 'events.jsonl'), linea, 'utf8');
}

export function leerEventos(proyecto) {
  const path = join(metricsDir(proyecto), 'events.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l, i) => {
      try { return JSON.parse(l); }
      catch { return { ts: null, event: 'CORRUPT', linea: i + 1 }; }
    });
}

export const ESTADO_VACIO = (proyecto, proyecto_id) => ({
  schema_version: 1,
  proyecto: proyecto,
  proyecto_id,
  updated: new Date().toISOString(),
  updated_by: null,
  current_stage: 'iniciativa',
  stages: {},
  blocked_by: null,
  next_action: 'Poner borradores en ideas/ y correr /dsc-refine',
  next_command: '/dsc-refine',
  last_error: null,
});

export function leerEstado(proyecto) {
  return readJson(join(metricsDir(proyecto), 'workflow-status.json'), null);
}

/** Relee antes de escribir y aborta si otra sesion toco el archivo. Ver contracts/state.md. */
export function escribirEstado(proyecto, estado, updatedEsperado = undefined) {
  const path = join(metricsDir(proyecto), 'workflow-status.json');
  if (updatedEsperado !== undefined) {
    const actual = readJson(path, null);
    if (actual && actual.updated !== updatedEsperado) {
      throw new Error(
        `El estado de "${proyecto}" cambio desde que lo leiste ` +
        `(esperado ${updatedEsperado}, en disco ${actual.updated}). ` +
        `Otra sesion escribio primero. Corre /dsc-status y reintenta.`
      );
    }
  }
  estado.updated = new Date().toISOString();
  writeJson(path, estado);
  return estado;
}

export function listarProyectos() {
  const reg = readYaml(join(ROOT, 'registry', 'proyectos.yaml'), { proyectos: [] });
  return (reg.proyectos ?? []).map((i) => i.slug);
}

export const slugify = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
