#!/usr/bin/env node
/**
 * gen-roadmap — vista ejecutiva del roadmap en HTML.
 *
 * El .md es la fuente de verdad. Este script lo lee y produce una vista que se
 * abre con doble clic: sin servidor, sin red, sin CDN.
 *
 * Parsea la "Tabla del roadmap" del template, cuyo formato es fijo. Si la tabla
 * falta o esta mal formada, falla ruidosamente en vez de dibujar algo incompleto:
 * un roadmap a medias induce mas error que ninguno.
 *
 * Uso:  node scripts/gen-roadmap.mjs <slug-del-proyecto>
 */

import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { ROOT, proyectoDir, writeAtomic } from '../lib/store.mjs';
import { shellHtml, moduloDatos } from '../lib/render.mjs';
import { leerTablaRoadmap, resolverDeps } from '../lib/roadmap.mjs';

const PRIORIDADES = { must: 'must', should: 'should', could: 'could' };

function salir(msg) {
  console.error(msg);
  process.exit(1);
}

function leerFrontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const linea of m[1].split('\n')) {
    const i = linea.indexOf(':');
    if (i > 0) out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  return out;
}

/** Palabra de la columna de tiempo del roadmap ("Trimestre", "Tramo", …), tomada
 *  del encabezado de la tabla. Por defecto "trimestre" (roadmaps anteriores). */
function leerEtiquetaTiempo(texto) {
  const i = texto.indexOf('## Tabla del roadmap');
  if (i === -1) return 'trimestre';
  for (const linea of texto.slice(i).split('\n').slice(1)) {
    const t = linea.trim();
    if (t.startsWith('##')) break;
    if (!t.startsWith('|')) continue;
    const celdas = t.split('|').slice(1, -1).map((c) => c.trim());
    if (/^épica$/i.test(celdas[0]) || /^epica$/i.test(celdas[0])) {
      return (celdas[5] || 'trimestre').toLowerCase();
    }
  }
  return 'trimestre';
}

/** Equipo/dedicación declarado en la sección "Equipo y dedicación", si existe:
 *  la primera frase en negrita (p. ej. "2 personas full-time"). Null si no está. */
function leerEquipo(texto) {
  const m = texto.match(/##\s*Equipo y dedicación\s*\n([\s\S]*?)(?:\n##\s|$)/);
  if (!m) return null;
  const b = m[1].match(/\*\*(.+?)\*\*/);
  return b ? b[1].trim() : null;
}

/**
 * Envoltorio fino sobre lib/roadmap.mjs: el parser es compartido con el audit.
 * Aca solo se decide que hacer cuando falta o esta vacia, que en un generador de
 * vista es fallar ruidosamente: un roadmap a medias induce mas error que ninguno.
 */
function leerTabla(texto) {
  const tabla = leerTablaRoadmap(texto);
  if (!tabla) salir('El roadmap no tiene la seccion "## Tabla del roadmap". Regeneralo con /dsc-roadmap.');
  if (!tabla.filas.length) salir('La tabla del roadmap esta vacia. No hay nada que dibujar.');
  return tabla.filas.map((f) => ({
    ...f,
    clase: PRIORIDADES[f.prioridad.toLowerCase().split(' ')[0]] ?? 'could',
  }));
}

const ESTILOS = `
  header { max-width: 1100px; margin: 0 auto 26px; }
  h1 { font-size: 21px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: var(--muted); font-size: 13px; }
  main { max-width: 1100px; margin: 0 auto; }
  .timeline { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 8px; }
  .q { flex: 1 1 220px; min-width: 220px; }
  .q h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); margin: 0 0 10px; padding-bottom: 8px;
    border-bottom: 2px solid var(--line);
  }
  .ep {
    background: var(--surface); border: 1px solid var(--line);
    border-left: 3px solid var(--muted);
    border-radius: 8px; padding: 12px 13px; margin-bottom: 10px;
  }
  .ep[data-p="must"]   { border-left-color: var(--bad); }
  .ep[data-p="should"] { border-left-color: var(--warn); }
  .ep[data-p="could"]  { border-left-color: var(--accent); }
  .ep .id { font-size: 11px; color: var(--muted); font-weight: 600; letter-spacing: .03em; }
  .ep .ob { margin: 4px 0 8px; font-size: 13.5px; }
  .ep .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag {
    font-size: 10.5px; padding: 2px 7px; border-radius: 20px;
    border: 1px solid var(--line); color: var(--muted); background: var(--bg);
  }
  .ep .dep { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 8px; }
  .ep .dep-lbl {
    font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
    color: var(--muted); margin-right: 1px;
  }
  .dep-tag { border-style: dashed; }
  .dep-tag.cruza { border-color: var(--warn); color: var(--warn); border-style: solid; }
  .dep-tag.falta { border-color: var(--bad); color: var(--bad); border-style: solid; }
  .leyenda { display: flex; gap: 18px; flex-wrap: wrap; margin: 26px 0 0; font-size: 12.5px; color: var(--muted); }
  .leyenda span { display: flex; align-items: center; gap: 6px; }
  .sw { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
  footer { max-width: 1100px; margin: 22px auto 0; color: var(--muted); font-size: 12px; }
`;

const SCRIPT = `<script>
/* Todo dato del roadmap entra por textContent: el contenido sale de artefactos
   escritos por personas y no es confiable. Ver constitution.md. */
(function () {
  'use strict';
  var D = window.DSC_ROADMAP;
  var el = function (t, c, x) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (x !== undefined && x !== null) n.textContent = String(x);
    return n;
  };

  document.getElementById('titulo').textContent = 'Roadmap — ' + D.proyecto;
  document.getElementById('sub').textContent =
    'Versión ' + D.version + ' · horizonte ' + D.horizonte +
    (D.equipo ? ' · ' + D.equipo : '') + ' · ' + D.epicas.length + ' épicas';

  var tl = document.getElementById('timeline');
  D.trimestres.forEach(function (q) {
    var col = el('div', 'q');
    col.appendChild(el('h2', null, q.nombre));
    q.epicas.forEach(function (e) {
      var c = el('div', 'ep');
      c.setAttribute('data-p', e.clase);
      c.appendChild(el('div', 'id', e.epica));
      c.appendChild(el('div', 'ob', e.objetivo));
      var tags = el('div', 'tags');
      if (e.capacidad) tags.appendChild(el('span', 'tag', e.capacidad));
      tags.appendChild(el('span', 'tag', e.prioridad));
      e.usuarios.forEach(function (u) { tags.appendChild(el('span', 'tag', u)); });
      c.appendChild(tags);
      if (e.depende && e.depende.length) {
        var dep = el('div', 'dep');
        dep.appendChild(el('span', 'dep-lbl', 'depende de'));
        e.depende.forEach(function (d) {
          var clase = 'tag dep-tag';
          var texto = d.id;
          if (d.falta) { clase += ' falta'; texto += ' ?'; }
          else if (d.cruza) { clase += ' cruza'; texto += ' \\u2197'; }
          dep.appendChild(el('span', clase, texto));
        });
        c.appendChild(dep);
      }
      col.appendChild(c);
    });
    if (!q.epicas.length) col.appendChild(el('div', 'tag', 'sin épicas'));
    tl.appendChild(col);
  });

  document.getElementById('pie').textContent =
    'Generado el ' + new Date(D.generado).toLocaleString('es-AR') +
    ' desde roadmap.md, que es la fuente de verdad. Esta vista se regenera: no la edites.';
})();
</script>`;

function main() {
  const slug = process.argv[2];
  if (!slug) salir('Falta el proyecto.\nUso: node scripts/gen-roadmap.mjs <slug>');

  const md = join(proyectoDir(slug), 'outputs', 'roadmap', 'roadmap.md');
  if (!existsSync(md)) salir(`No existe ${md}. Genera el roadmap con /dsc-roadmap.`);

  const texto = readFileSync(md, 'utf8');
  const fm = leerFrontmatter(texto);
  const filas = leerTabla(texto);
  const etiquetaTiempo = leerEtiquetaTiempo(texto);
  const equipo = leerEquipo(texto);

  const orden = [...new Set(filas.map((f) => f.trimestre).filter(Boolean))].sort();

  /* Resolver las dependencias contra el propio roadmap: el audit hace lo mismo
     con la misma funcion, asi la vista y la verificacion no pueden discrepar. */
  const epicas = resolverDeps(filas);

  const datos = {
    proyecto: fm.proyecto ?? slug,
    version: fm.version ?? '1',
    horizonte: fm.horizon ?? 'no declarado',
    equipo,
    etiquetaTiempo,
    generado: new Date().toISOString(),
    epicas,
    trimestres: orden.map((q) => ({ nombre: q, epicas: epicas.filter((f) => f.trimestre === q) })),
  };

  const cuerpo = `<header>
  <h1 id="titulo"></h1>
  <div class="sub" id="sub"></div>
</header>
<main>
  <div class="timeline" id="timeline"></div>
  <div class="leyenda">
    <span><i class="sw" style="background:var(--bad)"></i> Must Have</span>
    <span><i class="sw" style="background:var(--warn)"></i> Should Have</span>
    <span><i class="sw" style="background:var(--accent)"></i> Could Have</span>
    <span><i class="sw" style="background:var(--warn)"></i> &#8599; la dependencia está en otro ${etiquetaTiempo}</span>
    <span><i class="sw" style="background:var(--bad)"></i> ? la dependencia no existe en el roadmap</span>
  </div>
</main>
<footer id="pie"></footer>`;

  const destino = join(proyectoDir(slug), 'outputs', 'roadmap', 'roadmap.html');
  writeAtomic(destino, shellHtml({
    titulo: `Roadmap — ${datos.proyecto}`,
    estilos: ESTILOS,
    cuerpo,
    scripts: `<script>${moduloDatos(datos, 'DSC_ROADMAP')}</script>\n${SCRIPT}`,
  }));

  console.log(`Roadmap visual generado: ${datos.epicas.length} épicas en ${orden.length} ${etiquetaTiempo}s.`);
  console.log(`Abrilo con doble clic: proyectos/${slug}/outputs/roadmap/roadmap.html`);
}

main();
