#!/usr/bin/env node
/**
 * publicar — manda el estado de un proyecto al destino central.
 *
 * Publica dos cosas y son distintas:
 *   el plan vigente del proyecto, siempre;
 *   la linea base de cada feature entregada, una vez por version.
 *
 * Uso:
 *   node scripts/publicar.mjs <slug> --destino <url|carpeta>
 *   node scripts/publicar.mjs <slug> --destino <...> --dry-run
 *   node scripts/publicar.mjs <slug> --destino <...> --solo-plan
 *
 * El destino tambien sale de DSC_ESTADO_DESTINO, y el token de
 * DSC_ESTADO_TOKEN. El token NUNCA se pasa por linea de comandos: queda en el
 * historial del shell y en la lista de procesos de la maquina.
 *
 * Publicar es observabilidad, no un gate: este script no bloquea nada y sale
 * con 0 aunque el envio falle, salvo que le pidas --estricto. Un tablero que no
 * se actualizo no puede ser motivo para frenar a un equipo.
 */

import { planVigente, lineaBase, avisos } from '../lib/publicable.mjs';
import { publicar, esHttp } from '../lib/transporte.mjs';
import { leerProyectos } from '../lib/registry.mjs';

const args = process.argv.slice(2);
const valor = (n) => {
  const i = args.indexOf('--' + n);
  return i === -1 ? null : (args[i + 1] ?? '');
};
const tiene = (n) => args.includes('--' + n);

const CON_VALOR = new Set(['--destino']);
const slug = args.find((a, i) => !a.startsWith('--') && !CON_VALOR.has(args[i - 1]));

const destino = valor('destino') ?? process.env.DSC_ESTADO_DESTINO ?? '';
const token = process.env.DSC_ESTADO_TOKEN ?? '';
const dryRun = tiene('dry-run');
const estricto = tiene('estricto');

function salir(msg) {
  console.error(msg);
  process.exit(1);
}

if (!slug) {
  const lista = leerProyectos().map((p) => '  ' + p.slug + '  (' + p.id + ')');
  salir(
    'Falta el slug del proyecto.\n\n' +
    'Uso: node scripts/publicar.mjs <slug> --destino <url|carpeta>\n\n' +
    (lista.length ? 'Proyectos:\n' + lista.join('\n') : 'No hay proyectos todavia.')
  );
}
if (!destino) {
  salir(
    'Falta el destino.\n\n' +
    'Pasalo con --destino <url|carpeta> o en DSC_ESTADO_DESTINO.\n' +
    'Una carpeta local sirve para probar el mecanismo sin endpoint ni credenciales.'
  );
}

const plan = planVigente(slug);
if (!plan.clave.proyecto_id) {
  salir('El proyecto ' + slug + ' no tiene id en registry/proyectos.yaml: sin eso no se puede agrupar ni actualizar.');
}

for (const a of avisos(plan)) console.log('  aviso: ' + a);

console.log((dryRun ? 'Simulacion' : 'Publicando') + ' — ' + slug + ' (' + plan.clave.proyecto_id + ')');
console.log('  Destino   ' + (esHttp(destino) ? destino : destino + '  [carpeta local]'));
console.log('');

const envios = [{ que: 'plan vigente', objeto: plan }];

if (!tiene('solo-plan')) {
  for (const f of plan.features.filter((x) => x.status === 'HANDED_OFF')) {
    const base = lineaBase(slug, f.discovery_id);
    if (base) envios.push({ que: 'base ' + f.discovery_id + ' v' + base.clave.version, objeto: base });
  }
}

let fallos = 0;
for (const e of envios) {
  const r = await publicar({ destino, objeto: e.objeto, token, dryRun });
  if (r.estado === 'error') fallos++;
  const marca = r.estado === 'error' ? 'FALLO' : r.estado === 'dry-run' ? 'sim  ' : 'ok   ';
  console.log('  ' + marca + ' ' + e.que.padEnd(20) + ' ' + r.detalle);
}

console.log('');
if (fallos) {
  console.log(fallos + ' de ' + envios.length + ' envio(s) fallaron. No se perdio nada: el estado esta en disco y se puede reenviar.');
  process.exit(estricto ? 1 : 0);
}
console.log(envios.length + ' envio(s) ' + (dryRun ? 'simulados' : 'publicados') + '.');
