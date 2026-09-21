#!/usr/bin/env node
/**
 * impact — que quedaria obsoleto si se cambia un artefacto.
 *
 * Se corre ANTES de confirmar el cambio. Cambiar la vision con veinte features
 * ya definidas tiene un costo; la decision se toma sabiendo cual es.
 *
 * No muta nada.
 *
 * Uso:  node scripts/impact.mjs <slug> <etapa>[/<item>]
 */

import { leerEstado } from '../lib/store.mjs';
import { calcularImpacto, etapaInfo, leerEntrada, descendientes } from '../lib/cascade.mjs';

function salir(msg) { console.error(msg); process.exit(1); }

function main() {
  const [slug, referencia] = process.argv.slice(2);
  if (!slug || !referencia) salir('Uso: node scripts/impact.mjs <slug> <etapa>[/<item>]');

  const [etapa, itemId = null] = referencia.split('/');
  if (!etapaInfo(etapa)) salir(`Etapa desconocida: "${etapa}".`);

  const estado = leerEstado(slug);
  if (!estado) salir(`El proyecto "${slug}" no tiene estado.`);

  const entrada = leerEntrada(estado, etapa, itemId);
  const estadoActual = entrada?.status ?? 'PENDING';

  const { afectados } = calcularImpacto(estado, etapa, itemId);

  console.log(`Impacto de cambiar "${referencia}" (hoy: ${estadoActual})\n`);

  if (!afectados.length) {
    const posteriores = descendientes(etapa);
    console.log(posteriores.length
      ? `Ningun artefacto quedaria obsoleto: las etapas posteriores (${posteriores.join(', ')}) todavia no estan aprobadas.`
      : `Es la ultima etapa de la cadena: no hay nada aguas abajo.`);
    console.log(`\nPodes cambiarlo sin costo de retrabajo.`);
    return;
  }

  console.log(`${afectados.length} artefacto(s) quedarian OBSOLETOS y habria que regenerarlos:\n`);

  const porEtapa = new Map();
  for (const a of afectados) {
    if (!porEtapa.has(a.etapa)) porEtapa.set(a.etapa, []);
    porEtapa.get(a.etapa).push(a.item);
  }

  for (const [et, items] of porEtapa) {
    const info = etapaInfo(et);
    const detalle = items.filter(Boolean);
    console.log(`  ${info?.name ?? et}`);
    if (detalle.length) console.log(`    ${detalle.join(', ')}`);
    console.log(`    se regenera con ${info?.command ?? '/dsc-status'}`);
  }

  /* Trabajo humano en riesgo.
     `version > 1` es el proxy exacto de "alguien trabajo esto a mano despues de
     generarlo": la v1 sale del generador, las siguientes salen de un review o de
     un cambio. Regenerar desde arriba pisa ese trabajo — queda recuperable en
     history/, pero nadie va a diffear ocho features para encontrarlo.
     Es la unica parte del costo que no se ve mirando la lista de afectados. */
  const conTrabajo = afectados
    .map((a) => ({ ...a, entrada: leerEntrada(estado, a.etapa, a.item) }))
    .filter((a) => (a.entrada?.version ?? 1) > 1);

  if (conTrabajo.length) {
    console.log(`\nOJO — ${conTrabajo.length} de esos artefactos tienen trabajo hecho a mano:\n`);
    for (const a of conTrabajo) {
      const ref = a.item ? `${a.etapa}/${a.item}` : a.etapa;
      console.log(`  ${ref}  v${a.entrada.version}`);
    }
    console.log(`\nSi se regenera desde arriba, ese trabajo se pierde. Queda archivado en`);
    console.log(`outputs/history/, y se puede recuperar con /dsc-restore.`);
  }

  console.log(`\nNo se cambio nada todavia. Si decidis avanzar, registra la decision con /dsc-log.`);
}

main();
