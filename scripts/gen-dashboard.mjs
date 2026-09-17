#!/usr/bin/env node
/**
 * gen-dashboard — unico proyector del tablero.
 *
 * Lee project-metrics.json de cada proyecto y arma las tres vistas. El HTML
 * nunca lee archivos: solo consume window.DSC_DATA.
 *
 * Escribe dos archivos, los dos derivados del mismo objeto en una sola corrida:
 *
 *   dashboard/index.html  el tablero, autocontenido: los datos van inline
 *   dashboard/data.js     los mismos datos, para que otro comando los lea
 *
 * El tablero es autocontenido y no un <script src="./data.js"> porque se abre
 * con doble clic. Ver DEC-005 y el comentario de CSP en lib/render.mjs.
 *
 * Para la vista Portfolio intenta leer el features.yaml de cada repo SDD
 * destino. Si alguno no es accesible, usa lo ultimo conocido y lo marca como
 * desactualizado: el PMO igual necesita ver el resto.
 *
 * Uso:  node scripts/gen-dashboard.mjs
 */

import { join, isAbsolute, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ROOT, readYaml, readJson, writeAtomic, metricsDir } from '../lib/store.mjs';
import { moduloDatos } from '../lib/render.mjs';
import { ordenEtapas, etapaInfo } from '../lib/cascade.mjs';

/** Punto de la plantilla donde se inyectan los datos. */
const MARCA = '<!--DSC_DATOS-->';

/**
 * Arma el tablero autocontenido a partir de la plantilla.
 *
 * El reemplazo va con funcion y no con cadena a proposito: String.replace
 * interpreta $&, $1 y $' dentro del texto de reemplazo, y los datos salen de
 * artefactos que un tercero escribio. Un nombre de feature con "$&" corromperia
 * el archivo generado.
 */
function componerTablero(datos) {
  const plantilla = readFileSync(join(ROOT, 'dashboard', 'shell.html'), 'utf8');
  if (!plantilla.includes(MARCA)) {
    throw new Error(`dashboard/shell.html no tiene la marca ${MARCA}: no se puede inyectar los datos.`);
  }
  const bloque = `<script>\n${moduloDatos(datos)}</script>`;
  return plantilla.replace(MARCA, () => bloque);
}

/** Estado de una feature en el repo SDD destino, si se puede leer. */
function estadoEnSdd(repo) {
  if (!repo) return { accesible: false, motivo: 'sin repo declarado', features: [] };
  const base = isAbsolute(repo) ? repo : resolve(ROOT, repo);
  const path = join(base, 'specs', '_registry', 'features.yaml');
  if (!existsSync(path)) {
    return { accesible: false, motivo: 'el repo no es accesible desde esta maquina', features: [] };
  }
  try {
    const reg = readYaml(path, { features: [] });
    return { accesible: true, motivo: null, features: reg.features ?? [] };
  } catch (err) {
    return { accesible: false, motivo: `no se pudo leer: ${err.message}`, features: [] };
  }
}

function main() {
  const etapas = ordenEtapas().map((id) => ({ id, ...(etapaInfo(id) ?? {}) }));
  const iniciativas = readYaml(join(ROOT, 'registry', 'proyectos.yaml'), { proyectos: [] }).proyectos ?? [];
  const featuresReg = readYaml(join(ROOT, 'registry', 'features.yaml'), { features: [] }).features ?? [];

  const proyectos = [];
  for (const ini of iniciativas) {
    const m = readJson(join(metricsDir(ini.slug), 'project-metrics.json'), null);
    if (!m) {
      proyectos.push({
        slug: ini.slug, nombre: ini.nombre ?? ini.slug, iniciativa: ini.id,
        sin_metricas: true,
        mensaje: 'Todavia no se calcularon las metricas. Corre /dsc-metrics.',
      });
      continue;
    }
    /* Frescura de las metricas.
       `m.generated` dice cuando se calcularon; `updated` del estado, cuando se
       movio el proyecto. Si el estado es mas nuevo, lo que se dibuja es viejo.
       Sin esta marca el tablero presenta numeros de hace semanas como si fueran
       de hoy, y eso es peor que no mostrarlos: alguien decide sobre ellos. */
    const estado = readJson(join(metricsDir(ini.slug), 'workflow-status.json'), null);
    const desactualizado = Boolean(
      estado?.updated && m.generated && Date.parse(estado.updated) > Date.parse(m.generated)
    );

    proyectos.push({
      ...m,
      sin_metricas: false,
      desactualizado,
      estado_updated: estado?.updated ?? null,
      etapas,
    });
  }

  // --- Portfolio: cruce con los repos SDD destino ---
  const repos = [...new Set(featuresReg.map((f) => f.target_repo).filter(Boolean))];
  const lecturas = new Map(repos.map((r) => [r, estadoEnSdd(r)]));

  const portfolio = {
    iniciativas: iniciativas.map((i) => {
      const fs = featuresReg.filter((f) => f.proyecto === i.slug);
      const entregadas = fs.filter((f) => f.status === 'HANDED_OFF');
      const m = proyectos.find((p) => p.slug === i.proyecto);
      return {
        id: i.id, proyecto: i.slug, nombre: i.nombre ?? i.slug,
        owner: i.owner ?? null, estado: i.status ?? 'DISCOVERY',
        progreso: m?.sin_metricas ? null : (m?.progreso?.valor ?? null),
        calidad: m?.sin_metricas ? null : (m?.calidad?.indice ?? null),
        features_total: fs.length,
        features_discovery: fs.length - entregadas.length,
        features_entregadas: entregadas.length,
        bloqueos: m?.sin_metricas ? null : (m?.bloqueos?.valor ?? null),
      };
    }),
    entregas: featuresReg.filter((f) => f.status === 'HANDED_OFF').map((f) => {
      const lect = lecturas.get(f.target_repo) ?? { accesible: false, motivo: 'sin repo declarado', features: [] };
      const enSdd = lect.features.find((x) => x.id === f.feature_id);
      return {
        discovery_id: f.id, proyecto: f.proyecto, feature_id: f.feature_id,
        repo: f.target_repo, entregada: f.handed_off, size: f.size,
        estado_sdd: enSdd?.status ?? null,
        accesible: lect.accesible,
        motivo: lect.motivo,
      };
    }),
    repos_inaccesibles: [...lecturas.entries()]
      .filter(([, v]) => !v.accesible)
      .map(([repo, v]) => ({ repo, motivo: v.motivo })),
  };

  const datos = {
    generado: new Date().toISOString(),
    fase_modelo: '006-dashboard',
    etapas,
    proyectos,
    portfolio,
  };

  writeAtomic(join(ROOT, 'dashboard', 'index.html'), componerTablero(datos));
  writeAtomic(join(ROOT, 'dashboard', 'data.js'), moduloDatos(datos));

  const n = proyectos.length;
  console.log(n === 0
    ? 'Dashboard generado sin proyectos. Corre /dsc-new <proyecto> para empezar.'
    : `Dashboard generado: ${n} proyecto(s), ${portfolio.entregas.length} entrega(s) a desarrollo.`);
  if (portfolio.repos_inaccesibles.length) {
    console.log(`  ${portfolio.repos_inaccesibles.length} repo(s) SDD no accesibles: se muestra lo ultimo conocido.`);
  }
  console.log('Abrilo con doble clic: dashboard/index.html');
}

main();
