/**
 * transporte — manda los objetos publicables a su destino.
 *
 * Separado del proyector a proposito, igual que del lado SDD: `gen-estado`
 * decide QUE se publica, esto resuelve COMO. El transporte es lo reutilizable —
 * cambiar de destino no deberia obligar a tocar la forma del objeto.
 *
 * Dos destinos, y el segundo existe para poder probar:
 *
 *   https://...     POST al endpoint de la plataforma. El camino real.
 *   una carpeta     escribe los payload en disco, sin red. Permite ejercitar el
 *                   mecanismo entero sin endpoint y sin credenciales.
 *
 * Cero dependencias: `fetch` viene en Node. Deliberado — el endpoint de Neon
 * habla SQL por HTTP, asi que tampoco hace falta un driver para llegar a la
 * base si mas adelante se va directo.
 *
 * Lo que este modulo NO hace, y es importante: no decide cuando publicar, no
 * reintenta y no encola. Manda una vez y reporta que paso. Quien lo llama
 * decide si reintenta, porque solo el sabe si esta en un comando interactivo o
 * drenando una cola en segundo plano.
 */

/** La credencial nunca se imprime. Un token en un log es un token filtrado. */
const ocultar = (t) => (t ? t.slice(0, 4) + '…(' + t.length + ')' : 'sin token');

/**
 * ¿Mandar el token a este destino lo expone?
 *
 * Sobre `http://` el bearer viaja en texto plano. Contra localhost da igual —no
 * sale de la maquina—, pero contra cualquier otro host lo ve la red entera.
 *
 * Esto NO fija el destino: la URL sigue siendo libre, puede ser una base en la
 * nube, otro Docker en la LAN o lo que venga. Lo unico que hace es pedir que
 * mandar una credencial en claro sea un acto deliberado y no un descuido, con
 * una variable que se escribe una vez y queda a la vista.
 */
const LOCAL = /^(localhost|127(\.\d+){3}|\[::1\]|0\.0\.0\.0)$/i;

export function riesgoDeTextoPlano(destino, token) {
  if (!token) return null;
  let u;
  try { u = new URL(destino); } catch { return null; }
  if (u.protocol !== 'http:' || LOCAL.test(u.hostname)) return null;
  if (process.env.DSC_ESTADO_INSEGURO === '1') return null;
  return [
    'el destino es http:// y el token viajaria en texto plano hasta ' + u.hostname + '.',
    'Usa https://, o si la red es de confianza (un Docker en la LAN, por ejemplo)',
    'declaralo con DSC_ESTADO_INSEGURO=1.',
  ].join(' ');
}

/** ¿El destino es una URL HTTP o una carpeta local? */
export function esHttp(destino) {
  return /^https?:\/\//i.test(String(destino ?? ''));
}

/**
 * Nombre estable del payload dentro del destino.
 *
 * Determinista y derivado de la clave, no de la fecha: reenviar lo mismo tiene
 * que sobreescribir el mismo archivo, no acumular uno por corrida. Es el
 * equivalente en disco del upsert por clave.
 */
export function rutaDe(obj) {
  const pid = obj.clave?.proyecto_id ?? 'sin-proyecto';
  if (obj.tipo === 'discovery.linea_base') {
    return pid + '/base/' + obj.clave.discovery_id + '-v' + obj.clave.version + '.json';
  }
  return pid + '/plan.json';
}

/**
 * Manda un objeto.
 *
 * @param {object}  o
 * @param {string}  o.destino   URL del endpoint, o ruta de una carpeta local.
 * @param {object}  o.objeto    Lo que devuelve planVigente() o lineaBase().
 * @param {string} [o.token]    Bearer. Solo para destino HTTP.
 * @param {boolean}[o.dryRun]   No manda: informa que habria hecho.
 * @param {number} [o.timeoutMs]
 * @returns {Promise<{estado: 'publicado'|'dry-run'|'error', detalle: string}>}
 */
export async function publicar({ destino, objeto, token = '', dryRun = false, timeoutMs = 10000 }) {
  if (!destino) return { estado: 'error', detalle: 'falta el destino' };
  if (!objeto?.tipo) return { estado: 'error', detalle: 'el objeto no declara `tipo`' };

  const expuesto = riesgoDeTextoPlano(destino, token);
  if (expuesto) return { estado: 'error', detalle: expuesto };

  const ruta = rutaDe(objeto);

  if (dryRun) {
    return {
      estado: 'dry-run',
      detalle: (esHttp(destino) ? 'POST ' + destino : 'escribir ' + ruta + ' en ' + destino) +
        (esHttp(destino) ? '  [' + ocultar(token) + ']' : ''),
    };
  }

  if (!esHttp(destino)) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const archivo = join(destino, ruta);
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(objeto, null, 2) + '\n', 'utf8');
    return { estado: 'publicado', detalle: archivo };
  }

  try {
    const r = await fetch(destino, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // El tipo viaja tambien en la cabecera para que el receptor pueda
        // rutear sin parsear el cuerpo entero.
        'x-estado-tipo': objeto.tipo,
        'x-estado-schema': String(objeto.schema_version),
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify(objeto),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const cuerpo = await r.text().catch(() => '');

    // 409 no es un fallo: es el receptor diciendo "ya tengo algo mas nuevo".
    // Pasa cuando un reintento demorado llega despues de un envio fresco, y
    // tratarlo como error haria que la cola lo reintente para siempre.
    if (r.status === 409) return { estado: 'publicado', detalle: 'sin cambios: el destino ya tiene algo mas nuevo' };
    if (!r.ok) return { estado: 'error', detalle: 'HTTP ' + r.status + ' ' + cuerpo.slice(0, 200) };

    return { estado: 'publicado', detalle: 'HTTP ' + r.status + (cuerpo ? ' ' + cuerpo.slice(0, 120) : '') };
  } catch (e) {
    // Sin red no es un error del modelo: es un envio que hay que reintentar.
    // Se reporta como error para que quien llama lo deje en la cola, pero el
    // mensaje tiene que dejar claro que no se perdio nada.
    return { estado: 'error', detalle: (e.name === 'TimeoutError' ? 'timeout' : e.message) + ' — queda pendiente de reenvio' };
  }
}
