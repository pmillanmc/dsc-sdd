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
  for (const r of REG) respaldo[r] = readFileSync(join(ROOT, 'registry', `${r}.yaml`), 'utf8');
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
    if (respaldo[r] !== undefined) writeFileSync(join(ROOT, 'registry', `${r}.yaml`), respaldo[r], 'utf8');
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
