/**
 * publicable — arma lo que Discovery manda hacia afuera.
 *
 * Son dos objetos con vidas distintas, y la diferencia es todo el punto:
 *
 *   plan vigente  lo que el plan dice HOY. Se pisa cada vez que algo cambia.
 *   linea base    lo que se le entrego al dev en un handoff. No se pisa nunca.
 *
 * Con un unico registro mutable se pierde la sola pregunta que la plataforma
 * existe para contestar: si lo que se esta construyendo es lo que se prometio.
 * Si el plan cambia y el mismo archivo se actualiza, el desvio se vuelve
 * invisible justo cuando importa.
 *
 * El versionado no se inventa aca. `approve.mjs` ya escribe `version` y `hash`
 * por feature en el registro —lo dice su propio comentario: "para el check de
 * drift"— y `reabrir.mjs` sube la version sin tocar el hash. Este modulo los
 * expone, nada mas.
 *
 * Funciones puras de lectura: no escriben, no salen a la red, no terminan el
 * proceso. Quien las llama decide que hacer con el resultado.
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { proyectoDir, metricsDir, readJson, leerEstado } from './store.mjs';
import { leerProyectos, leerCapacidades, leerFeatures } from './registry.mjs';
import { leerTablaRoadmap } from './roadmap.mjs';

export const SCHEMA_VERSION = 1;
export const MODELO = 'discovery-model';

/** BC01 -> el dominio con el que SDD nombra lo mismo. Une modulos, no features. */
function dominioDe(capacidades, slug, capability) {
  const bc = capacidades.find((c) => c.id === capability && c.proyecto === slug);
  return bc?.sdd_domain ?? null;
}

/**
 * Una feature tal como sale del modelo.
 *
 * Los dos identificadores viajan juntos y eso no es redundancia: `discovery_id`
 * une con el roadmap y con las lineas base; `feature_id` es el unico nombre que
 * SDD conoce. Sin los dos no hay forma de cruzar las dos fotos.
 *
 * `version` y `hash` son la identidad de la version firmada: son lo que despues
 * permite decir "el dev construye contra la v1 y el plan ya va por la v2".
 */
function featurePublicable(f, dominio) {
  return {
    discovery_id: f.id,
    feature_id: f.feature_id ?? null,
    slug: f.slug ?? null,
    capability: f.capability ?? null,
    domain: dominio,
    epic: f.epic ?? null,
    release: f.release ?? null,
    size: f.size ?? null,
    status: f.status ?? null,
    version: f.version ?? 1,
    hash: f.hash ?? null,
    depends_on: f.depends_on ?? [],
    users: f.users ?? [],
    target_repo: f.target_repo ?? null,
    handed_off: f.handed_off ?? null,
  };
}

/**
 * Las epicas con su orden y sus dependencias, leidas de la tabla del roadmap.
 *
 * Se reusa `leerTablaRoadmap` en vez de parsear aca: el propio modulo advierte
 * que con el parser duplicado un cambio de formato deja a un consumidor leyendo
 * mal en silencio.
 *
 * `declara_dependencias` distingue "no tiene dependencias" de "el roadmap no
 * trae la columna". Quien consume no puede afirmar lo primero viendo lo segundo.
 */
function roadmapDe(slug) {
  const vacio = { epicas: [], declara_dependencias: false };
  const ruta = join(proyectoDir(slug), 'outputs', 'roadmap', 'roadmap.md');
  if (!existsSync(ruta)) return vacio;

  const tabla = leerTablaRoadmap(readFileSync(ruta, 'utf8'));
  if (!tabla) return vacio;

  return {
    declara_dependencias: tabla.tieneColumnaDeps,
    epicas: tabla.filas.map((f) => ({
      id: f.epica,
      objetivo: f.objetivo,
      capacidad: f.capacidad,
      prioridad: f.prioridad,
      trimestre: f.trimestre,
      usuarios: f.usuarios,
      depende_de: f.depende,
    })),
  };
}

/**
 * `created` del registro como ISO, para usarlo de piso cuando no hay estado.
 * Devuelve null si tampoco hay created: inventar una fecha seria peor, porque
 * el receptor la tomaria como 'este plan se movio' cuando nunca se movio.
 */
function fechaDeCreacion(ini) {
  if (!ini?.created) return null;
  const d = new Date(String(ini.created) + 'T00:00:00.000Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * El plan vigente de un proyecto: lo que se va a construir, hoy.
 *
 * Se publica con clave `(proyecto_id)` y se pisa. Es la foto que envejece.
 */
export function planVigente(slug) {
  const ini = leerProyectos().find((p) => p.slug === slug) ?? {};
  const capacidades = leerCapacidades();
  const estado = leerEstado(slug);
  const audit = readJson(join(metricsDir(slug), 'audit-result.json'), null);

  const features = leerFeatures()
    .filter((f) => f.proyecto === slug)
    .map((f) => featurePublicable(f, dominioDe(capacidades, slug, f.capability)));

  return {
    schema_version: SCHEMA_VERSION,
    tipo: 'discovery.plan',
    modelo: MODELO,
    generated: new Date().toISOString(),
    clave: { proyecto_id: ini.id ?? null },
    source: {
      proyecto_id: ini.id ?? null,
      proyecto: slug,
      nombre: ini.nombre ?? slug,
    },
    estado: {
      // `updated` sale del estado, NO de esta corrida: es lo que le permite a
      // quien recibe descartar un reintento viejo que llegue despues de uno mas
      // fresco. Con cola y reintentos, el orden de llegada no es el de los hechos.
      //
      // Un proyecto registrado que todavia no arranco no tiene estado, y por lo
      // tanto no tiene `updated`. Mandarlo en null rompe al receptor, que usa
      // esta marca para ordenar: sin fecha no hay con que comparar. Se cae a
      // `created`, la unica fecha honesta que tiene un plan sin historia.
      updated: estado?.updated ?? fechaDeCreacion(ini),
      etapa_actual: estado?.current_stage ?? null,
      bloqueado_por: estado?.blocked_by ?? null,
      audit: audit
        ? { errores: audit.errores ?? null, avisos: audit.avisos ?? null }
        : null,
    },
    roadmap: roadmapDe(slug),
    features,
  };
}

/**
 * La linea base de una feature: lo que cruzo al dev en el handoff.
 *
 * `version` va DENTRO de la clave a proposito. Una feature reabierta y vuelta a
 * entregar es una base nueva, no un update de la anterior: la v1 tiene que
 * sobrevivir o se pierde contra que se esta comparando lo construido.
 *
 * Devuelve null si la feature no esta en el registro.
 */
export function lineaBase(slug, discoveryId) {
  const plan = planVigente(slug);
  const feature = plan.features.find((f) => f.discovery_id === discoveryId);
  if (!feature) return null;

  return {
    schema_version: SCHEMA_VERSION,
    tipo: 'discovery.linea_base',
    modelo: MODELO,
    generated: new Date().toISOString(),
    clave: {
      proyecto_id: plan.source.proyecto_id,
      discovery_id: discoveryId,
      version: feature.version,
    },
    source: plan.source,
    feature,
    // Solo la epica de esta feature, no el roadmap entero: la base tiene que
    // decir en que orden estaba y de que dependia, no repetir el plan completo
    // en cada entrega.
    epica: plan.roadmap.epicas.find((e) => e.id === feature.epic) ?? null,
  };
}

/**
 * Avisos sobre lo que se va a publicar. No son errores: el objeto es valido.
 *
 * Existen para que quien publica sepa por que un campo salio nulo, en vez de
 * descubrirlo mirando un tablero incompleto.
 */
export function avisos(obj) {
  const out = [];
  const fs = obj.tipo === 'discovery.plan' ? obj.features : [obj.feature];

  if (!obj.source.proyecto_id) {
    out.push('falta el id del proyecto en registry/proyectos.yaml: no se puede agrupar ni actualizar');
  }

  const sinDominio = fs.filter((f) => f && !f.domain);
  if (sinDominio.length) {
    const ids = sinDominio.map((f) => f.discovery_id).join(', ');
    out.push(
      sinDominio.length + ' feature(s) sin dominio SDD resuelto: completar sdd_domain en ' +
      'registry/capabilities.yaml (' + ids + ')'
    );
  }

  const entregadasSinId = fs.filter((f) => f && f.status === 'HANDED_OFF' && !f.feature_id);
  if (entregadasSinId.length) {
    const ids = entregadasSinId.map((f) => f.discovery_id).join(', ');
    out.push(
      entregadasSinId.length + ' feature(s) entregada(s) sin feature_id: no van a cruzar con lo ' +
      'que publique SDD (' + ids + ')'
    );
  }

  if (obj.tipo === 'discovery.plan' && !obj.estado.updated) {
    out.push('el proyecto no tiene fecha de estado ni `created`: el receptor no va a poder ordenar esta publicacion contra las siguientes');
  }

  if (obj.tipo === 'discovery.plan' && !obj.roadmap.epicas.length) {
    out.push('el roadmap no tiene tabla legible: el plan sale sin epicas ni orden');
  }

  return out;
}
