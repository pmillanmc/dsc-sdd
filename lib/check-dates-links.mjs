/**
 * check-dates-links — revisa fechas y links en borradores de ideas/ (texto).
 *
 * Corre DESPUES de sanitize: el CLI aplica sanear() en memoria antes de
 * analizar, para que Unicode invisible o ANSI no distorsionen lineas ni
 * destinos. Este modulo no escribe disco ni abre red: solo analiza texto.
 *
 * Cero dependencias. Solo builtins.
 */

const MESES = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

const DIAS = {
  domingo: 0, lunes: 1, martes: 2,
  miercoles: 3, miércoles: 3,
  jueves: 4, viernes: 5,
  sabado: 6, sábado: 6,
};

const DIAS_NOM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const NUM_PALABRA = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

const ACORTADOS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'lnkd.in',
]);

const KEYWORDS_PLAZO = /entrega|entregable|vence|vencimiento|plazo|hito|deadline|fecha\s+l[ií]mite|compromiso/i;

const RE_FECHA_DOC = /^\s*fecha\s*:\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\s*$/i;

const RE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const RE_NUM = /\b(\d{1,2})([\/\-.])(\d{1,2})(?:\2(\d{2}|\d{4}))?\b/g;
const RE_TEXTO = /\b(?:(?:el\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\s+)?(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)\b(?:\s+de\s+(\d{4}))?/gi;
const RE_DIA_MAS_NUM = /\b(?:el\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\s+(\d{1,2})([\/\-.])(\d{1,2})(?:\3(\d{2}|\d{4}))?\b/gi;

const RE_RELATIVA = /\b(?:pasado\s+ma[nñ]ana|ma[nñ]ana|la\s+semana\s+que\s+viene|la\s+pr[oó]xima\s+semana|el\s+mes\s+que\s+viene|el\s+mes\s+pr[oó]ximo|a\s+fin\s+de\s+mes|(?:en|dentro\s+de)\s+(?:\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:d[ií]as?|semanas?|meses?))\b/gi;

const RE_MD_LINK = /\[([^\]]*)\]\(([^)\s]*(?:\s+[^)]*)?)\)/g;
const RE_ANGLE = /<(https?:\/\/[^>\s]+)>/gi;
const RE_BARE = /\b(https?:\/\/[^\s<>\)\]"']+|www\.[^\s<>\)\]"']+)/gi;

const h = (archivo, linea, tipo, severidad, mensaje, hint) =>
  ({ archivo, linea, tipo, severidad, mensaje, hint });

function esBisiesto(y) {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

function diasEnMes(m, y) {
  if (m < 1 || m > 12) return 0;
  return [31, esBisiesto(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function expandirAnio(a) {
  const n = Number(a);
  if (String(a).length === 4) return n;
  return n >= 70 ? 1900 + n : 2000 + n;
}

function fechaValida(d, m, y) {
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= diasEnMes(m, y);
}

function aIso(d, m, y) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function diaSemanaUtc(d, m, y) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function normalizarDia(nombre) {
  const k = nombre.toLowerCase().normalize('NFC');
  return DIAS[k] ?? DIAS[k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')] ?? null;
}

function mesDe(nombre) {
  return MESES[nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] ?? null;
}

function recortar(s, n = 160) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

/**
 * Extrae la fecha del documento de las primeras 10 lineas no vacias.
 * @returns {{ dia: number, mes: number, anio: number, iso: string } | null}
 */
export function extraerFechaDocumento(texto) {
  const lineas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  for (const linea of lineas.slice(0, 10)) {
    const m = linea.match(RE_FECHA_DOC);
    if (!m) continue;
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    const anio = Number(m[3]);
    if (!fechaValida(dia, mes, anio)) return null;
    return { dia, mes, anio, iso: aIso(dia, mes, anio) };
  }
  return null;
}

function tieneFechaDocumentoLinea(texto) {
  const lineas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  for (const linea of lineas.slice(0, 10)) {
    if (RE_FECHA_DOC.test(linea)) return true;
    RE_FECHA_DOC.lastIndex = 0;
  }
  return false;
}

/**
 * Enmascara user:pass@ en una URL. Nunca devuelve las credenciales.
 */
export function taparCredenciales(url) {
  return String(url ?? '').replace(/\/\/([^/@:\s]+):([^/@\s]+)@/g, '//***:***@');
}

function esIpPrivada(host) {
  const hst = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (hst === 'localhost' || hst === '::1') return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hst)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hst)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hst)) return true;
  const m = hst.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

function esHostInterno(host) {
  const hst = host.toLowerCase();
  if (esIpPrivada(hst)) return true;
  return /\.(local|internal|corp|lan)$/.test(hst);
}

function hostSinWww(host) {
  return String(host ?? '').toLowerCase().replace(/^www\./, '');
}

function pareceDireccion(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return true;
  // dominio.tld o path corto tipo ejemplo.com/x
  return /^[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(t);
}

/**
 * Analiza un texto ya saneado (en memoria) y produce hallazgos + listados.
 * @param {string} texto
 * @param {string} archivo
 * @returns {{
 *   hallazgos: Array<object>,
 *   fechas: Array<object>,
 *   links: Array<object>,
 *   fechaDocumento: string | null,
 *   analizado: boolean
 * }}
 */
export function analizarTexto(texto, archivo) {
  const hallazgos = [];
  const fechas = [];
  const links = [];
  const contenido = String(texto ?? '');
  const lineas = contenido.split(/\r?\n/);

  const lineaDe = (idx) => {
    let acc = 0;
    for (let i = 0; i < lineas.length; i++) {
      const fin = acc + lineas[i].length;
      if (idx <= fin) return i + 1;
      acc = fin + 1; // \n
    }
    return lineas.length || 1;
  };

  const fechaDoc = extraerFechaDocumento(contenido);
  const hayLineaFecha = tieneFechaDocumentoLinea(contenido);
  if (!fechaDoc) {
    hallazgos.push(h(
      archivo, 1, 'SIN_FECHA_DOCUMENTO', 'AVISO',
      hayLineaFecha
        ? 'La linea de Fecha del documento no es una fecha valida (dd/mm/aaaa).'
        : 'El documento no declara su fecha al principio.',
      'Agregá al principio del documento la línea: Fecha: dd/mm/aaaa',
    ));
  }

  // Rangos de links primero: una IP o path no debe leerse como fecha (ej. 192.168.1.10 → "1.10").
  const rangosLink = [];
  for (const m of contenido.matchAll(RE_MD_LINK)) rangosLink.push([m.index, m.index + m[0].length]);
  for (const m of contenido.matchAll(RE_ANGLE)) rangosLink.push([m.index, m.index + m[0].length]);
  for (const m of contenido.matchAll(RE_BARE)) rangosLink.push([m.index, m.index + m[0].length]);
  const enLink = (start, end) => rangosLink.some(([a, b]) => start < b && end > a);

  // ── Fechas ──────────────────────────────────────────────────────────────
  const encontradas = []; // { start, end, original, dia, mes, anio|null, weekday|null, ambiguedad }
  const ocupado = [];

  const marcarRango = (start, end) => ocupado.push([start, end]);
  const libre = (start, end) =>
    !ocupado.some(([a, b]) => start < b && end > a) && !enLink(start, end);

  const pareceFragmentoIp = (start, end, sep) => {
    if (sep !== '.') return false;
    const izq = contenido.slice(Math.max(0, start - 8), start);
    const der = contenido.slice(end, end + 8);
    return /\d\.$/.test(izq) || /^\.\d/.test(der);
  };

  // 1) día de semana + numérica
  for (const m of contenido.matchAll(RE_DIA_MAS_NUM)) {
    const start = m.index;
    const end = start + m[0].length;
    if (!libre(start, end) || pareceFragmentoIp(start, end, m[3])) continue;
    const weekday = normalizarDia(m[1]);
    const a = Number(m[2]);
    const b = Number(m[4]);
    const anio = m[5] ? expandirAnio(m[5]) : null;
    encontradas.push({
      start, end, original: m[0], dia: a, mes: b, anio, weekday,
      ambiguedad: clasificarAmbiguedad(a, b),
      formato: 'num',
    });
    marcarRango(start, end);
  }

  // 2) textuales "15 de octubre [de 2026]" con día opcional
  for (const m of contenido.matchAll(RE_TEXTO)) {
    const start = m.index;
    const end = start + m[0].length;
    if (!libre(start, end)) continue;
    const weekday = m[1] ? normalizarDia(m[1]) : null;
    const dia = Number(m[2]);
    const mes = mesDe(m[3]);
    const anio = m[4] ? Number(m[4]) : null;
    if (!mes) continue;
    encontradas.push({
      start, end, original: m[0], dia, mes, anio, weekday,
      ambiguedad: 'dm', // textual siempre día/mes
      formato: 'texto',
    });
    marcarRango(start, end);
  }

  // 3) ISO
  for (const m of contenido.matchAll(RE_ISO)) {
    const start = m.index;
    const end = start + m[0].length;
    if (!libre(start, end)) continue;
    // no tomar la Fecha: del documento como fecha de cuerpo si esta en cabecera? Si, puede listarse;
    // pero evitamos duplicar controles absurdos: igual la listamos.
    encontradas.push({
      start, end, original: m[0],
      dia: Number(m[3]), mes: Number(m[2]), anio: Number(m[1]),
      weekday: null, ambiguedad: 'iso', formato: 'iso',
    });
    marcarRango(start, end);
  }

  // 4) numéricas restantes
  for (const m of contenido.matchAll(RE_NUM)) {
    const start = m.index;
    const end = start + m[0].length;
    if (!libre(start, end) || pareceFragmentoIp(start, end, m[2])) continue;
    const a = Number(m[1]);
    const b = Number(m[3]);
    const anio = m[4] ? expandirAnio(m[4]) : null;
    encontradas.push({
      start, end, original: m[0], dia: a, mes: b, anio, weekday: null,
      ambiguedad: clasificarAmbiguedad(a, b),
      formato: 'num',
    });
    marcarRango(start, end);
  }

  // Excluir la propia "Fecha: dd/mm/aaaa" del documento de los controles de cuerpo
  // (sigue pudiendo aparecer en `fechas` solo si no es cabecera). Filtramos por linea.
  const fechasCuerpo = encontradas.filter((f) => {
    const ln = lineaDe(f.start);
    const linea = lineas[ln - 1] ?? '';
    return !RE_FECHA_DOC.test(linea);
  });

  const haySoloDm = fechasCuerpo.some((f) => f.ambiguedad === 'solo-dm');
  const haySoloMd = fechasCuerpo.some((f) => f.ambiguedad === 'solo-md');

  for (const f of fechasCuerpo) {
    const ln = lineaDe(f.start);
    const renglon = recortar(lineas[ln - 1] ?? '');
    let dia = f.dia;
    let mes = f.mes;
    let anio = f.anio;

    // Interpretacion por defecto: dia/mes. Si es solo-md, invertir.
    if (f.ambiguedad === 'solo-md') {
      dia = f.mes;
      mes = f.dia;
    } else if (f.ambiguedad === 'iso') {
      // ya viene dia/mes/anio bien
    }

    if (anio == null) {
      hallazgos.push(h(
        archivo, ln, 'SIN_ANIO', 'INFO',
        `La fecha "${f.original}" no trae año: se asume el año del documento.`,
        fechaDoc
          ? `Se usa ${fechaDoc.anio} (año de la Fecha del documento). Confirmá si corresponde.`
          : 'Declará la Fecha del documento para poder asumir el año.',
      ));
      anio = fechaDoc?.anio ?? null;
    }

    let normalizada = null;
    let imposible = false;

    if (anio != null) {
      if (!fechaValida(dia, mes, anio)) {
        imposible = true;
        hallazgos.push(h(
          archivo, ln, 'FECHA_IMPOSIBLE', 'AVISO',
          `La fecha "${f.original}" no existe en el calendario.`,
          'Revisá día y mes: por ejemplo 31/02 o un 29/02 fuera de año bisiesto no cierran.',
        ));
      } else {
        normalizada = aIso(dia, mes, anio);
      }
    } else if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
      imposible = true;
      hallazgos.push(h(
        archivo, ln, 'FECHA_IMPOSIBLE', 'AVISO',
        `La fecha "${f.original}" no puede ser una fecha real.`,
        'Revisá día y mes.',
      ));
    } else if (mes >= 1 && mes <= 12 && dia > diasEnMes(mes, 2024) && dia > diasEnMes(mes, 2023)) {
      // 31/02 etc sin año
      imposible = true;
      hallazgos.push(h(
        archivo, ln, 'FECHA_IMPOSIBLE', 'AVISO',
        `La fecha "${f.original}" no existe en el calendario.`,
        'Revisá día y mes.',
      ));
    }

    if (!imposible && f.weekday != null && anio != null && fechaValida(dia, mes, anio)) {
      const real = diaSemanaUtc(dia, mes, anio);
      if (real !== f.weekday) {
        hallazgos.push(h(
          archivo, ln, 'DIA_NO_COINCIDE', 'AVISO',
          `Dice "${DIAS_NOM[f.weekday]}" pero ${aIso(dia, mes, anio)} cae un ${DIAS_NOM[real]}.`,
          'Corregí el día de la semana o la fecha para que coincidan.',
        ));
      }
    }
    // Si falta año y no hay fecha de documento, no evaluar DIA_NO_COINCIDE (ya cubierto: anio null)

    if (haySoloDm && haySoloMd && f.ambiguedad === 'solo-md') {
      hallazgos.push(h(
        archivo, ln, 'MEZCLA_FORMATOS', 'AVISO',
        `La fecha "${f.original}" parece mes/día en un archivo que también tiene fechas día/mes.`,
        'Unificá el formato a día/mes (dd/mm/aaaa) en todo el documento.',
      ));
    }

    if (!imposible && fechaDoc && anio != null && fechaValida(dia, mes, anio)) {
      const iso = aIso(dia, mes, anio);
      if (iso < fechaDoc.iso && KEYWORDS_PLAZO.test(lineas[ln - 1] ?? '')) {
        hallazgos.push(h(
          archivo, ln, 'ANTERIOR_AL_DOCUMENTO', 'AVISO',
          `Hay un plazo/entrega con fecha ${iso}, anterior a la Fecha del documento (${fechaDoc.iso}).`,
          'Confirmá si el compromiso ya venció o si la fecha está mal cargada.',
        ));
      }
    }

    fechas.push({
      archivo,
      linea: ln,
      original: f.original,
      normalizada,
      renglon,
    });
  }

  // Relativas
  for (const m of contenido.matchAll(RE_RELATIVA)) {
    const ln = lineaDe(m.index);
    const sev = fechaDoc ? 'INFO' : 'AVISO';
    hallazgos.push(h(
      archivo, ln, 'FECHA_RELATIVA', sev,
      `Aparece la expresión relativa "${m[0]}": no se puede fijar una fecha exacta solo con el texto.`,
      'Confirmá la fecha exacta (dd/mm/aaaa) con quien escribió el borrador.',
    ));
  }

  // ── Links ───────────────────────────────────────────────────────────────
  const linksVistos = []; // ranges

  const registrarLink = (start, end, texto, destinoRaw, esMarkdown) => {
    linksVistos.push([start, end]);
    const ln = lineaDe(start);
    const destinoTapado = taparCredenciales(destinoRaw);
    links.push({ archivo, linea: ln, texto: texto ?? '', destino: destinoTapado });
    analizarLink(archivo, ln, texto ?? '', destinoRaw, esMarkdown, hallazgos);
  };

  for (const m of contenido.matchAll(RE_MD_LINK)) {
    registrarLink(m.index, m.index + m[0].length, m[1], m[2].trim(), true);
  }

  for (const m of contenido.matchAll(RE_ANGLE)) {
    const start = m.index;
    const end = start + m[0].length;
    if (linksVistos.some(([a, b]) => start < b && end > a)) continue;
    registrarLink(start, end, '', m[1], false);
  }

  for (const m of contenido.matchAll(RE_BARE)) {
    const start = m.index;
    const end = start + m[0].length;
    if (linksVistos.some(([a, b]) => start < b && end > a)) continue;
    registrarLink(start, end, '', m[1], false);
  }

  return {
    hallazgos,
    fechas,
    links,
    fechaDocumento: fechaDoc?.iso ?? null,
    analizado: true,
  };
}

function clasificarAmbiguedad(a, b) {
  // a = primer numero, b = segundo (interpretacion default dia/mes)
  if (a > 12 && b <= 12) return 'solo-dm';
  if (b > 12 && a <= 12) return 'solo-md';
  return 'ambiguo';
}

function analizarLink(archivo, linea, texto, destinoRaw, esMarkdown, hallazgos) {
  const destino = String(destinoRaw ?? '').trim();

  if (/\/\/([^/@:\s]+):([^/@\s]+)@/.test(destino)) {
    hallazgos.push(h(
      archivo, linea, 'CREDENCIALES_EN_LINK', 'AVISO',
      `El link ${taparCredenciales(destino)} trae usuario y contraseña embebidos.`,
      'Sacalos del link, usá una variable de entorno y rotá esa credencial.',
    ));
  }

  let host = null;
  let protocol = null;
  let malFormado = false;
  let motivo = null;

  if (/\s/.test(destino)) {
    malFormado = true;
    motivo = 'tiene espacios';
  } else if (/^htp:/i.test(destino) || /^https?:\/(?!\/)/i.test(destino)) {
    malFormado = true;
    motivo = 'el esquema está mal escrito';
  } else {
    const teniaEsquema = /^[a-z][a-z0-9+.-]*:/i.test(destino);
    const esWww = /^www\./i.test(destino);

    if (esMarkdown && !teniaEsquema && !esWww && !/^#/.test(destino) && !/^mailto:/i.test(destino)) {
      malFormado = true;
      motivo = 'no tiene esquema (https://…)';
      const talvezHost = destino.split('/')[0].split(':')[0];
      if (esHostInterno(talvezHost)) host = talvezHost;
    } else {
      const candidato = esWww ? `https://${destino}` : destino;
      try {
        const u = new URL(candidato);
        host = u.hostname;
        protocol = u.protocol;
      } catch {
        malFormado = true;
        motivo = 'no se puede interpretar como URL';
      }
    }
  }

  if (host && esHostInterno(host)) {
    hallazgos.push(h(
      archivo, linea, 'LINK_INTERNO', 'AVISO',
      `El link apunta a una dirección interna (${host}).`,
      'Reemplazalo por un destino alcanzable fuera de la red local, o sacalo del borrador.',
    ));
  } else if (malFormado) {
    hallazgos.push(h(
      archivo, linea, 'LINK_MAL_FORMADO', 'AVISO',
      `El link "${taparCredenciales(destino)}" está mal formado${motivo ? ` (${motivo})` : ''}.`,
      'Dejalo como https://dominio/… sin espacios ni esquemas inventados.',
    ));
  } else if (host && !host.includes('.') && !esIpPrivada(host)) {
    hallazgos.push(h(
      archivo, linea, 'LINK_MAL_FORMADO', 'AVISO',
      `El link "${taparCredenciales(destino)}" tiene un host sin dominio.`,
      'Dejalo como https://dominio/…',
    ));
  }

  if (host && ACORTADOS.has(hostSinWww(host))) {
    hallazgos.push(h(
      archivo, linea, 'LINK_ACORTADO', 'AVISO',
      `El link usa un acortador (${hostSinWww(host)}).`,
      'Pedí el link completo: los acortadores esconden el destino real.',
    ));
  }

  if (texto && pareceDireccion(texto) && host) {
    const th = hostSinWww(texto.replace(/^https?:\/\//i, '').split('/')[0]);
    const dh = hostSinWww(host);
    if (th && dh && th !== dh) {
      hallazgos.push(h(
        archivo, linea, 'TEXTO_ENGANOSO', 'AVISO',
        `El texto del link parece "${th}" pero el destino es "${dh}".`,
        'Igualá el texto visible al dominio real, o usá un texto descriptivo que no parezca una URL.',
      ));
    }
  }

  if (protocol === 'http:') {
    hallazgos.push(h(
      archivo, linea, 'SIN_HTTPS', 'INFO',
      `El link ${taparCredenciales(destino)} usa http en vez de https.`,
      'Preferí https:// si el sitio lo ofrece.',
    ));
  }
}

/**
 * Analiza un archivo segun su extension. .md se analiza; el resto solo FUERA_DE_REGLA.
 */
export function analizarArchivo(ruta, contenidoCrudo, sanearFn) {
  const ext = ruta.includes('.') ? `.${ruta.split('.').pop().toLowerCase()}` : '';
  if (ext !== '.md') {
    return {
      archivo: ruta,
      fechaDocumento: null,
      analizado: false,
      hallazgos: [h(
        ruta, 1, 'FUERA_DE_REGLA', 'AVISO',
        `El archivo no es Markdown (${ext || 'sin extensión'}).`,
        'Pasalo a .md para poder revisarlo con el resto de los borradores.',
      )],
      fechas: [],
      links: [],
    };
  }
  const limpio = sanearFn(contenidoCrudo).limpio;
  const r = analizarTexto(limpio, ruta);
  return {
    archivo: ruta,
    fechaDocumento: r.fechaDocumento,
    analizado: true,
    hallazgos: r.hallazgos,
    fechas: r.fechas,
    links: r.links,
  };
}
