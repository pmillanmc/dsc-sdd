#!/usr/bin/env node
/**
 * smoke — prueba el propio Discovery Model de punta a punta.
 *
 * Recorre la cadena completa sobre un proyecto descartable y verifica que cada
 * eslabon siga funcionando. Es el equivalente de /sdd-test: prueba el modelo,
 * no un proyecto.
 *
 * Limpia siempre al terminar, incluso si falla: no puede dejar residuos en
 * proyectos/ ni tocar el registro real.
 *
 * Uso:  node scripts/smoke.mjs
 */

import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, rmSync, copyFileSync, readFileSync, appendFileSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, proyectoDir, readYaml, writeYaml, reservarIds, leerEventos, sha256 } from '../lib/store.mjs';
import { marcarInicio } from '../lib/cascade.mjs';
import { sanear } from '../lib/sanitize.mjs';

const SLUG = 'smoke-test-descartable';
const REG = ['ids', 'proyectos', 'capabilities', 'features'];

let fallos = 0;
const paso = (nombre, fn) => {
  try {
    const detalle = fn();
    console.log(`  ok    ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  } catch (err) {
    console.log(`  FALLA ${nombre}`);
    console.log(`        ${err.message.split('\n')[0]}`);
    fallos++;
  }
};

const correr = (script, ...args) =>
  execFileSync('node', [join(ROOT, 'scripts', script), ...args], { encoding: 'utf8', cwd: ROOT });

const debe = (cond, msg) => { if (!cond) throw new Error(msg); };

// --- Respaldo del registro real ---------------------------------------------
// El smoke escribe en los mismos archivos que el modelo. Se respalda todo y se
// restaura al final: una prueba que contamina el registro es peor que no probar.
const respaldo = {};
function respaldar() {
  for (const r of REG) {
    const path = join(ROOT, 'registry', `${r}.yaml`);
    // Desde DEC-013 estos archivos estan gitignoreados: un clone recien hecho no
    // los tiene, y eso no es un error sino el estado inicial de una maquina que
    // todavia no hizo ningun discovery. Se anota como ausente para poder dejar
    // el arbol como estaba, sin dejar registros vacios de una corrida de prueba.
    respaldo[r] = existsSync(path) ? readFileSync(path, 'utf8') : null;
  }
}
/** Espera bloqueante sin dependencias: el smoke es sincrono de punta a punta. */
const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * En Windows el borrado recursivo falla con EPERM cuando algo todavia tiene un
 * handle abierto — el indexador, el antivirus o el sincronizador de la nube —
 * justo despues de una rafaga de escrituras. Es el mismo escenario que
 * contracts/state.md contempla para las escrituras del modelo.
 *
 * No alcanza con los reintentos internos de rmSync: hay que darle tiempo al
 * sistema a soltar los handles entre intento e intento.
 */
function borrarProyecto() {
  const dir = proyectoDir(SLUG);
  for (let intento = 1; intento <= 5; intento++) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      if (!existsSync(dir)) return { ok: true, intentos: intento };
    } catch { /* se reintenta abajo */ }
    esperar(300 * intento);
  }
  return { ok: false, intentos: 5 };
}

function restaurar() {
  for (const r of REG) {
    const path = join(ROOT, 'registry', `${r}.yaml`);
    if (respaldo[r] === null) { if (existsSync(path)) unlinkSync(path); }
    else if (respaldo[r] !== undefined) writeFileSync(path, respaldo[r], 'utf8');
  }
  const r = borrarProyecto();
  if (!r.ok) {
    console.log(`\n  Aviso: no se pudo borrar proyectos/${SLUG} despues de ${r.intentos} intentos.`);
    console.log(`  Es un bloqueo del sistema de archivos, no una falla del modelo.`);
    console.log(`  Borrala a mano y volve a correr el smoke.`);
  }
}

function main() {
  console.log('Smoke test del Discovery Model\n');
  respaldar();

  const P = proyectoDir(SLUG);

  paso('crear proyecto', () => {
    correr('new-proyecto.mjs', 'Smoke Test Descartable', '--owner', 'smoke');
    debe(existsSync(join(P, 'metrics', 'workflow-status.json')), 'no se creo el estado');
    return SLUG;
  });

  paso('sanitize limpia unicode invisible y ANSI en ideas/', () => {
    const sucio = join(P, 'ideas', 'minuta-sucia.md');
    const visible = 'Recepcion tarda 45 minutos.\nSiguiente linea.';
    // RLO + ZWSP + CSI: el caso que un LLM no ve, y el orden ANSI-antes-de-Unicode.
    const payload = `\u202ERecepcion\u200B tarda 45 minutos.\n\x1B[31mSiguiente linea.\x1B[0m`;
    writeFileSync(sucio, payload, 'utf8');
    try {
      const lib = sanear(payload);
      debe(lib.limpio === visible, `lib dejo ${JSON.stringify(lib.limpio)}`);
      debe(lib.cantidadAnsi === 2, `conto ${lib.cantidadAnsi} ANSI, esperaba 2`);
      debe(lib.hallazgosUnicode.some((h) => h.nombre.includes('bidi')), 'no reporto bidi');
      debe(lib.hallazgosUnicode.some((h) => h.nombre === 'zero-width'), 'no reporto zero-width');
      debe(!lib.limpio.includes('[31m'), 'el orden ANSI/Unicode dejo basura visible');

      const reporte = JSON.parse(correr('sanitize.mjs', SLUG, '--json'));
      const r = reporte.archivos.find((a) => a.archivo.endsWith('minuta-sucia.md'));
      debe(Boolean(r?.tuvoHallazgos), 'el CLI no reporto hallazgos');
      debe(r.escrito === false, 'escribio el archivo sin --write');
      debe(readFileSync(sucio, 'utf8') === payload, 'modifico ideas/ sin --write');

      correr('sanitize.mjs', SLUG, '--write');
      debe(readFileSync(sucio, 'utf8') === visible, '--write no dejo el texto visible intacto');

      const despues = JSON.parse(correr('sanitize.mjs', SLUG, '--json'));
      const r2 = despues.archivos.find((a) => a.archivo.endsWith('minuta-sucia.md'));
      debe(!r2?.tuvoHallazgos, 'siguio reportando hallazgos despues de limpiar');
      return 'detecta, no escribe sin --write, limpia con --write';
    } finally {
      try { unlinkSync(sucio); } catch { /* el restore borra el proyecto entero */ }
    }
  });

  paso('check-dates-links detecta fechas y links en ideas/', () => {
    const path = join(P, 'ideas', 'minuta-fechas.md');
    const clave = 'claveSecreta99xyz';
    // CRLF a proposito: el script tiene que numerar bien en Windows.
    const lineas = [
      'Fecha: 15/10/2026',
      '',
      'Imposible: el 31/02/2026 no existe.',
      'Dia malo: reunion el domingo 15/10/2026.',
      'Mezcla: el 25/03/2026 y el 03/25/2026.',
      'Sin anio: firmaron el 15/03 el acuerdo.',
      `Invisible: reunion el 20/1\u200B0/2026.`,
      'Relativa: lo vemos manana y en tres dias.',
      'Compromiso de entrega 01/10/2026.',
      'Mal formado: [detalle](ejemplo.com/docs)',
      'Acortado: [corto](https://bit.ly/abc123)',
      'Interno: [lan](http://192.168.1.10/admin)',
      'Engano: [google.com](https://evil.example/phish)',
      `Creds: [privado](https://usuario:${clave}@example.com/ruta)`,
      'Sin https: http://inseguro.example.com/pagina',
    ];
    const payload = lineas.join('\r\n');
    writeFileSync(path, payload, 'utf8');
    try {
      const outJson = correr('check-dates-links.mjs', SLUG, '--json');
      debe(!outJson.includes(clave), 'la contraseña real aparecio en la salida JSON');
      const reporte = JSON.parse(outJson);
      debe(!reporte.archivos.some((a) => /leeme\.md$/i.test(a.archivo)), 'analizo LEEME.md');

      const mios = reporte.hallazgos.filter((h) => h.archivo.endsWith('minuta-fechas.md'));
      const tipoEn = (tipo, linea) => mios.some((h) => h.tipo === tipo && h.linea === linea);
      debe(tipoEn('FECHA_IMPOSIBLE', 3), 'no detecto FECHA_IMPOSIBLE en L3');
      debe(tipoEn('DIA_NO_COINCIDE', 4), 'no detecto DIA_NO_COINCIDE en L4');
      debe(tipoEn('MEZCLA_FORMATOS', 5), 'no detecto MEZCLA_FORMATOS en L5');
      debe(tipoEn('POSIBLE_FECHA', 6), 'no detecto POSIBLE_FECHA en L6');
      debe(tipoEn('FECHA_RELATIVA', 8), 'no detecto FECHA_RELATIVA en L8');
      debe(tipoEn('ANTERIOR_AL_DOCUMENTO', 9), 'no detecto ANTERIOR_AL_DOCUMENTO en L9');
      debe(tipoEn('LINK_MAL_FORMADO', 10), 'no detecto LINK_MAL_FORMADO en L10');
      debe(tipoEn('LINK_ACORTADO', 11), 'no detecto LINK_ACORTADO en L11');
      debe(tipoEn('LINK_INTERNO', 12), 'no detecto LINK_INTERNO en L12');
      debe(tipoEn('TEXTO_ENGANOSO', 13), 'no detecto TEXTO_ENGANOSO en L13');
      debe(tipoEn('CREDENCIALES_EN_LINK', 14), 'no detecto CREDENCIALES_EN_LINK en L14');
      debe(tipoEn('SIN_HTTPS', 15), 'no detecto SIN_HTTPS en L15');
      debe(!tipoEn('SIN_HTTPS', 12), 'emitio SIN_HTTPS junto con LINK_INTERNO');

      for (let i = 1; i < mios.length; i++) {
        debe(mios[i].linea >= mios[i - 1].linea, 'hallazgos no ordenados por linea');
      }

      const credH = mios.find((h) => h.tipo === 'CREDENCIALES_EN_LINK');
      debe(credH && credH.mensaje.includes('***:***'), 'creds no tapadas en hallazgos');
      debe(!credH.mensaje.includes(clave), 'la clave aparecio en el mensaje de credenciales');
      const credL = reporte.links.find((l) => l.archivo.endsWith('minuta-fechas.md') && l.linea === 14);
      debe(credL && credL.destino.includes('***:***'), 'creds no tapadas en links');
      debe(!credL.destino.includes(clave), 'la clave aparecio en links[].destino');

      const fecInv = reporte.fechas.find((f) =>
        f.archivo.endsWith('minuta-fechas.md') && f.normalizada === '2026-10-20');
      debe(Boolean(fecInv), 'no reconocio la fecha con unicode invisible (20/10/2026)');
      debe(reporte.fechas.every((f) => !String(f.renglon).includes('\r')), 'algun renglon trae \\r');

      debe(readFileSync(path, 'utf8') === payload, 'modifico ideas/ (no debe escribir)');

      correr('check-dates-links.mjs', SLUG); // exit 0 si no tira
      return 'fechas, links, orden, CRLF, creds tapadas, sin escritura';
    } finally {
      try { unlinkSync(path); } catch { /* restore */ }
    }
  });

  paso('check-dates-links avisa lo que queda fuera de regla', () => {
    const sinFecha = join(P, 'ideas', 'sin-fecha.md');
    const txt = join(P, 'ideas', 'notas.txt');
    writeFileSync(sinFecha, 'Notas sueltas sin cabecera.\nFecha escondida aca no cuenta.\n', 'utf8');
    writeFileSync(txt, 'Fecha: 01/01/2020\nesto no se analiza\n', 'utf8');
    try {
      const reporte = JSON.parse(correr('check-dates-links.mjs', SLUG, '--json'));
      const hSin = reporte.hallazgos.filter((h) => h.archivo.endsWith('sin-fecha.md'));
      debe(hSin.some((h) => h.tipo === 'SIN_FECHA_DOCUMENTO'), 'no aviso SIN_FECHA_DOCUMENTO');
      const hTxt = reporte.hallazgos.filter((h) => h.archivo.endsWith('notas.txt'));
      debe(hTxt.length === 1 && hTxt[0].tipo === 'FUERA_DE_REGLA', 'notas.txt no dio solo FUERA_DE_REGLA');
      debe(!reporte.fechas.some((f) => f.archivo.endsWith('notas.txt')), 'analizo el contenido de .txt');
      const archTxt = reporte.archivos.find((a) => a.archivo.endsWith('notas.txt'));
      debe(archTxt && archTxt.analizado === false, 'marco .txt como analizado');
      return 'SIN_FECHA_DOCUMENTO + FUERA_DE_REGLA';
    } finally {
      try { unlinkSync(sinFecha); } catch { /* restore */ }
      try { unlinkSync(txt); } catch { /* restore */ }
    }
  });

  paso('check-dates-links distingue fecha sin año de fracción/precio', () => {
    const path = join(P, 'ideas', 'minuta-posible-fecha.md');
    const cuerpo = [
      'Fecha: 15/10/2026',
      '',
      'Precio aproximado 12.50 pesos.',
      'Firmaron el 15 de marzo el acuerdo.',
      'Reunion el lunes 3/4.',
    ].join('\n');
    writeFileSync(path, cuerpo, 'utf8');
    try {
      const reporte = JSON.parse(correr('check-dates-links.mjs', SLUG, '--json'));
      const mios = reporte.hallazgos.filter((h) => h.archivo.endsWith('minuta-posible-fecha.md'));
      debe(!mios.some((h) => h.tipo === 'FECHA_IMPOSIBLE'), '12.50 disparo FECHA_IMPOSIBLE');
      debe(!mios.some((h) => h.tipo === 'POSIBLE_FECHA'), 'precio 12.50 salio como POSIBLE_FECHA');
      debe(mios.some((h) => h.tipo === 'SIN_ANIO' && h.linea === 4), 'textual sin anio no dio SIN_ANIO');
      debe(mios.some((h) => h.tipo === 'SIN_ANIO' && h.linea === 5), 'dia+num sin anio no dio SIN_ANIO');
      return '12.50 ignorado, textual y dia+num conservan SIN_ANIO';
    } finally {
      try { unlinkSync(path); } catch { /* restore */ }
    }
  });

  paso('check-dates-links lee fechas en el texto visible de un link Markdown', () => {
    const path = join(P, 'ideas', 'minuta-fecha-en-link.md');
    const cuerpo = [
      'Fecha: 15/10/2026',
      '',
      'Ver [entrega 3/4/2026](https://x.com/12/03) para el detalle.',
    ].join('\n');
    writeFileSync(path, cuerpo, 'utf8');
    try {
      const reporte = JSON.parse(correr('check-dates-links.mjs', SLUG, '--json'));
      const fechas = reporte.fechas.filter((f) => f.archivo.endsWith('minuta-fecha-en-link.md'));
      debe(fechas.some((f) => f.original.includes('3/4/2026')), 'no leyo la fecha del texto del link');
      debe(!fechas.some((f) => f.original.trim() === '12/03'), 'leyo un numero de la URL como fecha');
      return 'fecha del texto del link detectada, URL ignorada';
    } finally {
      try { unlinkSync(path); } catch { /* restore */ }
    }
  });

  paso('check-dates-links tapa credenciales en fechas[].renglon del JSON', () => {
    const path = join(P, 'ideas', 'minuta-creds-renglon.md');
    const cuerpo = [
      'Fecha: 15/10/2026',
      '',
      'Entrega 20/10/2026 ver https://usuario:clave@host.example/docs',
      'Hito 22/10/2026 ver https://token@host.example/api',
    ].join('\n');
    writeFileSync(path, cuerpo, 'utf8');
    try {
      const outJson = correr('check-dates-links.mjs', SLUG, '--json');
      debe(!outJson.includes('clave'), 'aparecio "clave" en el JSON');
      debe(!outJson.includes('token'), 'aparecio "token" en el JSON');
      debe(!outJson.includes('usuario:'), 'aparecio "usuario:" en el JSON');
      const reporte = JSON.parse(outJson);
      const mias = reporte.fechas.filter((f) => f.archivo.endsWith('minuta-creds-renglon.md'));
      debe(mias.length >= 2, 'no listo las fechas del documento con creds');
      debe(mias.every((f) => String(f.renglon).includes('***')), 'renglon sin *** tras tapar creds');
      return 'renglon tapado user:pass y token-only';
    } finally {
      try { unlinkSync(path); } catch { /* restore */ }
    }
  });

  paso('check-dates-links no marca anclas ni links relativos como mal formados', () => {
    const path = join(P, 'ideas', 'minuta-links-relativos.md');
    const cuerpo = [
      'Fecha: 15/10/2026',
      '',
      'Ver [la sección](#alcance) y [el título](#2-plan-de-trabajo).',
      'Ver [notas](./notas.md), [otro](../docs/otro.md) y [guía](docs/guia.md).',
      'Archivo suelto [resumen](resumen.md).',
      'Pero esto sí: [detalle](ejemplo.com/docs).',
    ].join('\n');
    writeFileSync(path, cuerpo, 'utf8');
    try {
      const reporte = JSON.parse(correr('check-dates-links.mjs', SLUG, '--json'));
      const m = reporte.hallazgos.filter((h) => h.archivo.endsWith('minuta-links-relativos.md'));
      debe(!m.some((h) => h.tipo === 'LINK_MAL_FORMADO' && h.linea === 3), 'ancla marcada mal formada');
      debe(!m.some((h) => h.tipo === 'LINK_MAL_FORMADO' && h.linea === 4), 'relativo marcado mal formado');
      debe(!m.some((h) => h.tipo === 'LINK_MAL_FORMADO' && h.linea === 5), 'archivo local marcado mal formado');
      debe(m.some((h) => h.tipo === 'LINK_MAL_FORMADO' && h.linea === 6), 'dominio sin esquema dejo de marcarse');
      return 'anclas y relativos ok, dominio sin esquema sigue marcado';
    } finally {
      try { unlinkSync(path); } catch { /* restore */ }
    }
  });

  paso('check-dates-links no genera ruido en un documento sano', () => {
    const path = join(P, 'ideas', 'minuta-sana.md');
    const cuerpo = [
      'Fecha: 15/10/2026',
      '',
      'Nos reunimos el 01/10/2026 para alinear alcance.',
      'La entrega del hito 1 es el jueves 22/10/2026.',
      'Referencia: [documentacion del producto](https://example.com/docs/guia).',
      '',
    ].join('\n');
    writeFileSync(path, cuerpo, 'utf8');
    try {
      const reporte = JSON.parse(correr('check-dates-links.mjs', SLUG, '--json'));
      const avisos = reporte.hallazgos.filter((h) =>
        h.archivo.endsWith('minuta-sana.md') && h.severidad === 'AVISO');
      debe(avisos.length === 0, `documento sano produjo AVISO: ${avisos.map((a) => a.tipo).join(', ')}`);
      return 'cero AVISO';
    } finally {
      try { unlinkSync(path); } catch { /* restore */ }
    }
  });

  paso('escribir la cadena de artefactos', () => {
    const f = readFileSync(join(ROOT, 'fixtures', 'cadena.md'), 'utf8');
    const partes = Object.fromEntries(
      f.split(/^=== (.+) ===$/m).slice(1).reduce((a, v, i, arr) =>
        i % 2 === 0 ? [...a, [v.trim(), arr[i + 1].trim()]] : a, [])
    );
    writeFileSync(join(P, 'iniciativa.md'), partes.iniciativa, 'utf8');
    writeFileSync(join(P, 'outputs', 'vision', 'vision.md'), partes.vision, 'utf8');
    writeFileSync(join(P, 'outputs', 'roadmap', 'roadmap.md'), partes.roadmap, 'utf8');
    writeFileSync(join(P, 'outputs', 'releases', 'R1.md'), partes.release, 'utf8');
    writeFileSync(join(P, 'outputs', 'features', 'F001-caso-de-prueba.md'), partes.feature, 'utf8');
    return '5 artefactos';
  });

  paso('registrar capacidad y feature', () => {
    const pc = join(ROOT, 'registry', 'capabilities.yaml');
    const c = readYaml(pc, { capabilities: [] });
    c.capabilities.push({ id: 'BC01', proyecto: SLUG, name: 'Prueba', epics: ['EP001'], sdd_domain: 'prueba' });
    writeYaml(pc, c);

    // El ID se reserva del registro, no se escribe a mano. El smoke tiene que
    // respetar contracts/ids.md como cualquier otro comando: si lo saltea, el
    // check 10 del audit lo detecta — y con razon.
    const [id] = reservarIds('F', SLUG, 1);
    const pf = join(ROOT, 'registry', 'features.yaml');
    const r = readYaml(pf, { features: [] });
    r.features.push({
      id, proyecto: SLUG, slug: 'caso-de-prueba', proyecto_id: 'PRY-001',
      capability: 'BC01', epic: 'EP001', release: 'R1', users: ['U01'],
      size: null, status: 'APPROVED', decisions: [], depends_on: [],
    });
    writeYaml(pf, r);
    return id;
  });

  paso('marcar la cadena como aprobada', () => {
    const p = join(P, 'metrics', 'workflow-status.json');
    const s = JSON.parse(readFileSync(p, 'utf8'));
    const ahora = new Date().toISOString();
    const firma = { 'Product Owner': { by: 'smoke', at: ahora, verdict: 'approved' } };
    for (const e of ['iniciativa', 'vision', 'roadmap']) {
      s.stages[e] = { status: 'APPROVED', version: 1, approved_at: ahora, approvals: firma };
    }
    s.stages.release = { status: 'APPROVED', items: { R1: { status: 'APPROVED', version: 1, approved_at: ahora, approvals: firma } } };
    s.stages.features = { status: 'APPROVED', items: { F001: { status: 'APPROVED', version: 1, approved_at: ahora, approvals: { ...firma, QA: { by: 'smoke', at: ahora, verdict: 'approved' } } } } };
    writeFileSync(p, JSON.stringify(s, null, 2), 'utf8');
  });

  paso('generar el roadmap visual', () => {
    correr('gen-roadmap.mjs', SLUG);
    const h = join(P, 'outputs', 'roadmap', 'roadmap.html');
    debe(existsSync(h), 'no se genero el HTML');
    const c = readFileSync(h, 'utf8');
    debe(!/https?:\/\//.test(c), 'el HTML tiene referencias externas');
    debe(c.includes("default-src 'none'"), 'falta la CSP');
    return 'sin red, con CSP';
  });

  paso('estimar la feature', () => {
    const out = correr('estimate.mjs', SLUG, 'F001',
      '--funcional', 'S', '--interfaz', 'S', '--arquitectura', 'XS',
      '--integraciones', 'XS', '--seguridad', 'S', '--testing', 'S',
      '--justificacion', 'Caso de prueba minimo.');
    debe(/Talle\s+(XS|S)/.test(out), 'el talle no salio como se esperaba');
    return out.match(/Talle\s+(\w+)/)[1];
  });

  paso('audit sin errores', () => {
    const out = correr('discovery-audit.mjs', SLUG);
    debe(/0 error/.test(out), 'el audit encontro errores en un modelo que deberia estar sano');
    return (out.match(/(\d+) checks/) ?? [, '?'])[1] + ' checks';
  });

  paso('marcarInicio escribe la fecha y emite el evento', () => {
    const sp = join(P, 'metrics', 'workflow-status.json');
    const antes = readFileSync(sp, 'utf8');
    try {
      const ts = marcarInicio(SLUG, 'estimation', { actor: 'smoke', command: '/dsc-estimate' });
      debe(Boolean(ts), 'marcarInicio no devolvio timestamp');

      const s = JSON.parse(readFileSync(sp, 'utf8'));
      const e = s.stages.estimation;
      debe(e.started_at === ts, 'started_at no quedo en el estado');
      debe(e.started_by === 'smoke', 'started_by no quedo en el estado');
      debe(e.status === 'IN_PROGRESS', `la etapa quedo en ${e.status} y no en IN_PROGRESS`);

      const ev = leerEventos(SLUG).filter((x) => x.event === 'STAGE_STARTED' && x.stage === 'estimation');
      debe(ev.length === 1, 'no se emitio STAGE_STARTED');
      return 'estado y evento, en una sola llamada';
    } finally {
      writeFileSync(sp, antes, 'utf8');
    }
  });

  paso('la cronologia calcula los dias de una etapa', () => {
    const sp = join(P, 'metrics', 'workflow-status.json');
    const antes = readFileSync(sp, 'utf8');
    try {
      const s = JSON.parse(antes);
      s.stages.roadmap.started_at = '2026-08-01T00:00:00.000Z';
      s.stages.roadmap.approved_at = '2026-08-04T00:00:00.000Z';
      writeFileSync(sp, JSON.stringify(s, null, 2), 'utf8');

      correr('gen-metrics.mjs', SLUG);
      const m = JSON.parse(readFileSync(join(P, 'metrics', 'project-metrics.json'), 'utf8'));
      const r = (m.cronologia ?? []).find((x) => x.id === 'roadmap');
      debe(Boolean(r), 'la cronologia no trae la etapa roadmap');
      debe(r.dias === 3, `calculo ${r.dias} dias en vez de 3`);
      return `${r.dias} dias`;
    } finally {
      writeFileSync(sp, antes, 'utf8');
      correr('gen-metrics.mjs', SLUG);
    }
  });

  paso('el chequeo 17 detecta fechas invertidas', () => {
    const sp = join(P, 'metrics', 'workflow-status.json');
    const antes = readFileSync(sp, 'utf8');
    try {
      const s = JSON.parse(antes);
      s.stages.roadmap.started_at = '2026-08-09T00:00:00.000Z';
      s.stages.roadmap.approved_at = '2026-08-02T00:00:00.000Z';
      writeFileSync(sp, JSON.stringify(s, null, 2), 'utf8');

      let salida = '';
      try { salida = correr('discovery-audit.mjs', SLUG); }
      catch (err) { salida = String(err.stdout ?? ''); }

      debe(/\[17\]/.test(salida), 'el chequeo 17 no emitio nada');
      debe(/Arranco despues de haber sido aprobada/.test(salida), 'no detecto las fechas invertidas');
      return 'inversion detectada';
    } finally {
      writeFileSync(sp, antes, 'utf8');
    }
  });

  paso('el chequeo 17 ignora una etapa sin fecha de inicio', () => {
    // El estado del smoke no tiene started_at en ninguna etapa: es el mismo caso
    // que un proyecto aprobado antes de que el campo existiera.
    let salida = '';
    try { salida = correr('discovery-audit.mjs', SLUG); }
    catch (err) { salida = String(err.stdout ?? ''); }
    debe(!/\[17\]/.test(salida), 'el chequeo 17 opino sobre etapas sin fecha de inicio');
    return 'sin ruido retroactivo';
  });

  paso('el chequeo 16 detecta un ciclo entre epicas', () => {
    const rm = join(P, 'outputs', 'roadmap', 'roadmap.md');
    const bueno = readFileSync(rm, 'utf8');
    try {
      // Un roadmap con ciclo (EP001 <-> EP002) y una referencia rota (EP099).
      writeFileSync(rm, bueno.replace(
        /\| EP001 \|.*\|\r?\n/,
        '| EP001 | Verificar la cadena de punta a punta | BC01 | Must Have | U01 | Q1 | EP002 |\n' +
        '| EP002 | Segunda epica del caso de prueba | BC01 | Must Have | U01 | Q1 | EP001, EP099 |\n'
      ), 'utf8');

      let salida = '';
      try { salida = correr('discovery-audit.mjs', SLUG); }
      catch (err) { salida = String(err.stdout ?? ''); }

      debe(/Ciclo de dependencias entre epicas/.test(salida), 'no detecto el ciclo entre epicas');
      debe(/no esta en la tabla del roadmap/.test(salida), 'no detecto la referencia rota');
      debe(/\[16\]/.test(salida), 'los hallazgos no salieron del chequeo 16');
      return 'ciclo y referencia rota detectados';
    } finally {
      // Restaurar siempre: el paso siguiente asume el proyecto sano.
      writeFileSync(rm, bueno, 'utf8');
    }
  });

  paso('el chequeo 16 ignora un roadmap sin la columna', () => {
    const rm = join(P, 'outputs', 'roadmap', 'roadmap.md');
    const bueno = readFileSync(rm, 'utf8');
    try {
      // Roadmap de seis columnas, como los generados antes de que existiera la
      // columna: el chequeo no tiene que opinar sobre el.
      writeFileSync(rm, bueno
        .replace(' | Depende de |', ' |')
        .replace('|---|---|---|---|---|---|---|', '|---|---|---|---|---|---|')
        .replace(/(\| EP001 \|.*\|) — \|/, '$1'), 'utf8');

      let salida = '';
      try { salida = correr('discovery-audit.mjs', SLUG); }
      catch (err) { salida = String(err.stdout ?? ''); }

      debe(!/\[16\]/.test(salida), 'el chequeo 16 opino sobre un roadmap que no declara dependencias');
      return 'opt-in respetado';
    } finally {
      writeFileSync(rm, bueno, 'utf8');
    }
  });

  paso('calcular metricas', () => {
    correr('gen-metrics.mjs', SLUG);
    const m = JSON.parse(readFileSync(join(P, 'metrics', 'project-metrics.json'), 'utf8'));
    debe(m.progreso.valor > 0, 'el progreso quedo en cero');
    return `progreso ${m.progreso.valor}%, calidad ${m.calidad.indice}/100`;
  });

  paso('el tablero marca las metricas desactualizadas', () => {
    const sp = join(P, 'metrics', 'workflow-status.json');
    const antes = readFileSync(sp, 'utf8');
    /* Se parsea el payload, no se busca la cadena con un regex de ventana: el
       objeto de un proyecto real pesa varios miles de caracteres y una ventana
       fija puede leer la marca del proyecto de al lado. */
    const leerDelTablero = () => {
      correr('gen-dashboard.mjs');
      const d = readFileSync(join(ROOT, 'dashboard', 'data.js'), 'utf8');
      const m = d.match(/window\.DSC_DATA\s*=\s*([\s\S]*);\s*$/);
      debe(Boolean(m), 'no se pudo leer el payload del tablero');
      const datos = JSON.parse(m[1]);
      const p = datos.proyectos.find((x) => (x.proyecto ?? x.slug) === SLUG);
      debe(Boolean(p), 'el proyecto de prueba no aparece en el tablero');
      return p.desactualizado === true;
    };
    try {
      correr('gen-metrics.mjs', SLUG);
      debe(!leerDelTablero(), 'marco como viejas unas metricas recien calculadas');

      // El proyecto se mueve despues del calculo: es el caso real que hay que avisar.
      const s = JSON.parse(readFileSync(sp, 'utf8'));
      s.updated = new Date(Date.now() + 60_000).toISOString();
      writeFileSync(sp, JSON.stringify(s, null, 2), 'utf8');
      debe(leerDelTablero(), 'no marco como viejas unas metricas anteriores al ultimo cambio');

      return 'detecta viejas y no marca frescas';
    } finally {
      writeFileSync(sp, antes, 'utf8');
      correr('gen-metrics.mjs', SLUG);
    }
  });

  paso('generar el tablero', () => {
    correr('gen-dashboard.mjs');
    const d = readFileSync(join(ROOT, 'dashboard', 'data.js'), 'utf8');
    debe(!d.slice(d.indexOf('=')).includes('<'), 'el payload tiene < sin escapar');
    debe(d.includes(SLUG), 'el proyecto de prueba no aparece en el tablero');

    /* El tablero se abre con file://. Un script externo o una CSP con 'self'
       lo dejan en blanco sin avisar: el navegador bloquea y no hay error
       visible. Paso a paso porque ya pasó una vez. Ver DEC-005. */
    const h = readFileSync(join(ROOT, 'dashboard', 'index.html'), 'utf8');
    debe(h.includes('window.DSC_DATA'), 'el tablero no tiene los datos inline: con file:// queda en blanco');
    debe(!/<script[^>]+src=/.test(h), 'el tablero carga un script externo: file:// lo bloquea');
    const csp = h.match(/http-equiv="Content-Security-Policy"[\s\S]{0,200}?content="([^"]*)"/);
    debe(csp, 'el tablero no declara CSP');
    debe(!csp[1].includes("'self'"), "la CSP usa 'self': con file:// el origen es opaco y bloquea todo");
    debe(csp[1].includes("default-src 'none'"), 'la CSP dejo de bloquear la salida a la red');
    debe(h.includes(SLUG), 'el proyecto de prueba no aparece en el HTML del tablero');
    return 'payload escapado, tablero autocontenido';
  });

  paso('exportar el handoff', () => {
    const out = correr('handoff.mjs', SLUG, 'F001', '--by', 'smoke');
    const brief = join(P, 'outputs', 'handoff', '001-caso-de-prueba', 'brief.md');
    debe(existsSync(brief), 'no se genero el brief');
    const b = readFileSync(brief, 'utf8');
    for (const s of ['PROBLEMA', 'USUARIO', 'DONE CRITERIA', 'OUT OF SCOPE', 'RESTRICCIONES TÉCNICAS', 'UI / FLUJO']) {
      debe(b.includes(`## ${s}`), `falta la seccion ## ${s} en el brief`);
    }
    debe(!b.includes('BLOQUE DISCOVERY'), 'el bloque Discovery se exporto y no deberia');
    return 'las 6 secciones, sin el bloque Discovery';
  });

  paso('reabrir devuelve a revision y apaga el aviso de hash', () => {
    const dir = join(P, 'outputs', 'features');
    const archivo = join(dir, readdirSync(dir).find((n) => n.startsWith('F001-')));
    const sp = join(P, 'metrics', 'workflow-status.json');

    // El chequeo 12 compara contra el hash que dejo la firma. La cadena del smoke
    // se estampa a mano y no lo tiene, asi que hay que reconstruir la precondicion:
    // un artefacto realmente aprobado siempre lo lleva (lo escribe approve.mjs).
    const s0 = JSON.parse(readFileSync(sp, 'utf8'));
    s0.stages.features.items.F001.status = 'APPROVED';
    s0.stages.features.items.F001.hash = sha256(readFileSync(archivo, 'utf8'));
    writeFileSync(sp, JSON.stringify(s0, null, 2), 'utf8');

    // Edicion a mano sobre algo firmado: es lo que le paso a seis features reales.
    appendFileSync(archivo, '\nAjuste hecho a mano despues de la firma.\n', 'utf8');
    let antes = '';
    try { antes = correr('discovery-audit.mjs', SLUG); }
    catch (err) { antes = String(err.stdout ?? ''); }
    debe(/\[12\]/.test(antes), 'el chequeo 12 no detecto la edicion a mano');

    const out = correr('reabrir.mjs', SLUG, 'features/F001', '--motivo', 'Ajuste del criterio', '--by', 'smoke');
    debe(/REABIERTO/.test(out), 'reabrir no reporto la transicion');

    const s = JSON.parse(readFileSync(join(P, 'metrics', 'workflow-status.json'), 'utf8'));
    const f = s.stages.features.items.F001;
    debe(f.status === 'IN_REVIEW', `quedo en ${f.status} y no en IN_REVIEW`);
    debe(f.version === 2, `quedo en v${f.version} y no en v2`);
    debe(f.reopened_by === 'smoke' && Boolean(f.reopened_reason), 'no registro autor y motivo');
    debe(!f.approved_at, 'quedo con fecha de aprobacion sobre una version sin firmar');

    const ev = leerEventos(SLUG).filter((e) => e.event === 'ARTIFACT_UPDATED' && e.was_approved);
    debe(ev.length === 1, 'no se emitio ARTIFACT_UPDATED con was_approved');

    // La propiedad elegante: el chequeo 12 saltea lo que no esta APPROVED, asi que
    // el aviso se apaga solo. No hay que tocar el hash.
    let despues = '';
    try { despues = correr('discovery-audit.mjs', SLUG); }
    catch (err) { despues = String(err.stdout ?? ''); }
    debe(!/\[12\]/.test(despues), 'el aviso del chequeo 12 sigue despues de reabrir');

    return 'v2, IN_REVIEW, aviso 12 apagado';
  });

  paso('re-firmar no pisa la entrega', () => {
    for (const rol of ['Product Owner', 'QA']) {
      correr('approve.mjs', SLUG, 'features/F001', '--as', rol, '--by', 'smoke');
    }
    const reg = readYaml(join(ROOT, 'registry', 'features.yaml'));
    const f = (reg.features ?? []).find((x) => x.id === 'F001' && x.proyecto === SLUG);
    debe(f.status === 'HANDED_OFF', `la re-firma dejo el estado en ${f.status} y borro la entrega`);
    debe(f.redelivery_pending === true, 'no quedo marcada para reenvio');
    debe(f.version === 2, `el registro quedo en v${f.version}`);
    return 'HANDED_OFF conservado, reenvio pendiente';
  });

  paso('approve se niega sobre algo aprobado y deriva a reabrir', () => {
    let salida = '';
    try {
      correr('approve.mjs', SLUG, 'vision', '--as', 'Product Owner', '--by', 'smoke');
      throw new Error('aprobo dos veces la misma version');
    } catch (err) {
      salida = String(err.stdout ?? '') + String(err.stderr ?? '') + err.message;
    }
    debe(/reabrir\.mjs/.test(salida), 'no señala reabrir.mjs como camino');
    return 'deriva al comando correcto';
  });

  paso('el gate rechaza una feature XL', () => {
    const pf = join(ROOT, 'registry', 'features.yaml');
    const r = readYaml(pf);
    const f = r.features.find((x) => x.id === 'F001' && x.proyecto === SLUG);
    f.size = 'XL'; f.status = 'APPROVED'; f.handed_off = null; f.feature_id = null;
    writeYaml(pf, r);
    let rechazo = false;
    try { correr('handoff.mjs', SLUG, 'F001', '--by', 'smoke'); }
    catch (err) { rechazo = /XL/.test(err.stdout ?? '') || /XL/.test(err.stderr ?? ''); }
    debe(rechazo, 'una feature XL logro cruzar a desarrollo');
    return 'XL bloqueada';
  });
}

try {
  main();
} catch (err) {
  console.log(`\nEl smoke se interrumpio: ${err.message}`);
  fallos++;
} finally {
  restaurar();
  // El tablero queda apuntando al proyecto de prueba: se regenera limpio.
  try { execFileSync('node', [join(ROOT, 'scripts', 'gen-dashboard.mjs')], { cwd: ROOT, stdio: 'ignore' }); } catch {}
}

const residuos = existsSync(proyectoDir(SLUG));
console.log(`\n  ${residuos ? 'FALLA' : 'ok   '} limpieza — ${residuos ? 'quedaron residuos en proyectos/' : 'sin residuos'}`);
if (residuos) fallos++;

console.log(fallos
  ? `\n${fallos} paso(s) fallaron. El modelo tiene algo roto.`
  : `\nTodos los pasos pasaron. El modelo funciona de punta a punta.`);
process.exit(fallos ? 1 : 0);
