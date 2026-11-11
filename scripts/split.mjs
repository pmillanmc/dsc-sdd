#!/usr/bin/env node
/**
 * split — divide una feature XL en varias mas chicas.
 *
 * Los IDs nuevos se reservan del registro y la original queda SUPERSEDED.
 * Nunca se renumera ni se reutiliza: renumerar rompe toda referencia previa,
 * incluidas las que ya cruzaron a desarrollo. Ver contracts/ids.md.
 *
 * Uso:
 *   node scripts/split.mjs <slug> <F002> --into "alta-usuarios,baja-usuarios" --by "<nombre>"
 */

import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  ROOT, proyectoDir, readYaml, writeYaml, writeAtomic, reservarIds,
  emitirEvento, slugify, leerEstado, escribirEstado,
} from '../lib/store.mjs';
import { leerEntrada, escribirEntrada } from '../lib/cascade.mjs';

function salir(msg) { console.error(msg); process.exit(1); }
function arg(n) { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1] ?? null; }

function rutaFeature(slug, id) {
  const dir = join(proyectoDir(slug), 'outputs', 'features');
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((n) => n.startsWith(`${id}-`));
  return f ? join(dir, f) : null;
}

function main() {
  const libres = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const [slug, featureId] = libres;
  const into = arg('into');
  const quien = arg('by');

  if (!slug || !featureId || !into) {
    salir('Uso: node scripts/split.mjs <slug> <F002> --into "slug-a,slug-b" --by "<nombre>"');
  }
  if (!quien) salir('Falta --by "<nombre>". Dividir una feature es una decision y tiene que quedar con autor.');

  const partes = into.split(',').map((s) => slugify(s.trim())).filter(Boolean);
  if (partes.length < 2) salir('Hay que indicar al menos dos partes en --into.');

  const pReg = join(ROOT, 'registry', 'features.yaml');
  const reg = readYaml(pReg, { features: [] });
  const original = (reg.features ?? []).find((f) => f.id === featureId && f.proyecto === slug);
  if (!original) salir(`La feature ${featureId} no esta en el registro del proyecto "${slug}".`);
  if (original.status === 'HANDED_OFF') salir(`${featureId} ya fue entregada a desarrollo. No se puede dividir.`);

  const ruta = rutaFeature(slug, featureId);
  const contenido = ruta ? readFileSync(ruta, 'utf8') : '';

  const nuevos = reservarIds('F', slug, partes.length);
  const hoy = new Date().toISOString().slice(0, 10);

  const hijas = partes.map((parte, i) => ({
    id: nuevos[i],
    proyecto: slug,
    slug: parte,
    proyecto_id: original.proyecto_id ?? null,
    capability: original.capability ?? null,
    epic: original.epic ?? null,
    release: original.release ?? null,
    users: original.users ?? [],
    size: null,
    status: 'DRAFT',
    owner: original.owner ?? null,
    claimed_by: null,
    claimed_at: null,
    hash: null,
    version: 1,
    feature_id: null,
    target_repo: null,
    handed_off: null,
    decisions: original.decisions ?? [],
    split_from: featureId,
  }));

  // La original no se borra: queda SUPERSEDED para que las referencias previas sigan resolviendo.
  original.status = 'SUPERSEDED';
  original.split_into = nuevos;
  reg.features.push(...hijas);
  writeYaml(pReg, reg);

  // Cada hija arranca del contenido de la original, marcada para completar.
  for (const hija of hijas) {
    const destino = join(proyectoDir(slug), 'outputs', 'features', `${hija.id}-${hija.slug}.md`);
    const cabecera = `<!-- Dividida de ${featureId} el ${hoy} por ${quien}.
     Recorta el alcance a lo que corresponde a esta parte y volve a estimar. -->\n\n`;
    writeAtomic(destino, cabecera + contenido);
  }

  // Reflejar la division en workflow-status.json. Sin esto, las hijas no existen
  // en el estado y approve.mjs las rechaza ("la etapa no fue generada todavia"):
  // quedarian inaprobables para siempre. Y la original seguiria APPROVED en el
  // estado mientras el registro la da por SUPERSEDED — estado y registro en
  // contradiccion permanente (audit/status la verian viva). Una sola escritura
  // atomica con el lock optimista.
  const estado = leerEstado(slug);
  if (estado) {
    const updatedAlLeer = estado.updated;
    const ahora = new Date().toISOString();
    // La original se retira: SUPERSEDED en cada etapa-con-items donde tenga entrada.
    for (const et of ['features', 'estimation', 'handoff']) {
      if (leerEntrada(estado, et, featureId)) {
        escribirEntrada(estado, et, featureId, {
          status: 'SUPERSEDED', superseded_by: nuevos, superseded_at: ahora,
        });
      }
    }
    // Cada hija entra como feature en curso: editable, revisable y aprobable.
    for (const hija of hijas) {
      escribirEntrada(estado, 'features', hija.id, {
        status: 'IN_PROGRESS', version: 1, started_at: ahora,
        started_by: quien, split_from: featureId,
      });
    }
    estado.updated_by = quien;
    escribirEstado(slug, estado, updatedAlLeer);
  }

  emitirEvento(slug, {
    stage: 'features', item: featureId, command: '/dsc-split',
    event: 'ARTIFACT_UPDATED', split_into: nuevos, actor: quien,
  });

  console.log(`Dividida — ${featureId} (${original.size ?? 'sin estimar'})\n`);
  for (const h of hijas) console.log(`  ${h.id}  ${h.slug}`);
  console.log(`\n  ${featureId} queda SUPERSEDED: no se borra, para que las referencias previas sigan resolviendo.`);
  console.log(`  Cada parte hereda epica (${original.epic}), capacidad (${original.capability}), release (${original.release}) y usuarios.`);
  console.log(`\nCada archivo arranca con una copia del original: hay que recortar el alcance de cada parte.`);
  console.log(`\nProximo paso:`);
  console.log(`  1. Editar cada feature para que su alcance sea el de esa parte`);
  console.log(`  2. /dsc-review y /dsc-approve`);
  console.log(`  3. /dsc-estimate para cada una — si alguna vuelve a dar XL, dividirla otra vez`);
  console.log(`  4. /dsc-log para registrar la division`);
}

try { main(); } catch (e) { console.error(e.message); process.exit(1); }
