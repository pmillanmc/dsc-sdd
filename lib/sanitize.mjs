/**
 * sanitize — remueve Unicode invisible y secuencias ANSI (SEC-02 / SEC-03).
 *
 * Un caracter invisible es, por definicion, el caso que un LLM tiene mas
 * chances de no ver en su propio contexto. Por eso se resuelve aca, con
 * script, no con lectura. El check de inyeccion / secretos de /dsc-refine
 * sigue siendo juicio del agente, sobre el texto ya limpio.
 *
 * Orden: ANSI primero, Unicode despues. Una secuencia ANSI empieza con un
 * byte de control (ESC/BEL) que el paso Unicode tambien removeria, dejando
 * el resto de la secuencia como texto visible en vez de neutralizarla.
 *
 * Cero dependencias. Solo builtins.
 */

/** Bidi override / isolate: LRE RLE PDF LRO RLO + LRI RLI FSI PDI. */
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g;

/** Marcas direccionales: LRM, RLM, ALM. No son override/isolate: van aparte. */
const DIR_MARK = /[\u200E\u200F\u061C]/g;

/** Zero-width: ZWSP ZWNJ ZWJ, word joiner, BOM, Mongolian vowel separator. */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u180E]/g;

/** Soft hyphen: U+00AD. */
const SOFT_HYPHEN = /\u00AD/g;

/** Combining Grapheme Joiner: U+034F. */
const CGJ = /\u034F/g;

/** Rellenos Hangul: choseong, jungseong, filler de compatibilidad y su versi\u00F3n halfwidth. */
const HANGUL_FILLER = /[\u115F\u1160\u3164\uFFA0]/g;

/** Braille pattern blank: U+2800. Se ve como espacio pero no lo es. */
const BRAILLE_BLANK = /\u2800/g;

/** Variation selectors: VS1-VS16 y VS17-VS256 (plano suplementario). */
const VARIATION = /[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]/gu;

/** Tag characters: language tag + U+E0020..E007F (CANCEL TAG inclusive). */
const TAG = /[\u{E0001}\u{E0020}-\u{E007F}]/gu;

/**
 * Control C0/C1 salvo tab, LF y CR. Incluye ESC y BEL sueltos que quedaron
 * despues del paso ANSI, y DEL (U+007F).
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * CSI (ESC [ ... o C1 0x9B) y OSC (ESC ] ... BEL o ST).
 * No cubre DCS/PM/APC: ideas/ es texto, no un stream de terminal.
 */
const ANSI = /(?:\x1B\[|\x9B)[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]|\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g;

const CATEGORIAS = [
  { nombre: 'bidi override/isolate', re: BIDI },
  { nombre: 'marca direccional (LRM/RLM/ALM)', re: DIR_MARK },
  { nombre: 'zero-width', re: ZERO_WIDTH },
  { nombre: 'soft hyphen', re: SOFT_HYPHEN },
  { nombre: 'combining grapheme joiner', re: CGJ },
  { nombre: 'relleno hangul', re: HANGUL_FILLER },
  { nombre: 'braille blank', re: BRAILLE_BLANK },
  { nombre: 'variation selector', re: VARIATION },
  { nombre: 'tag character', re: TAG },
  { nombre: 'control C0/C1', re: CONTROL },
];

/**
 * Quita matches de `re` y cuenta. Copia el regex para no heredar lastIndex
 * de una corrida anterior: los /g de modulo son objetos vivos.
 */
function quitarYContar(texto, re) {
  const copia = new RegExp(re.source, re.flags);
  let cantidad = 0;
  const limpio = texto.replace(copia, () => {
    cantidad += 1;
    return '';
  });
  return { limpio, cantidad };
}

/**
 * Remueve secuencias de escape ANSI (CSI / OSC).
 * @param {string} texto
 * @returns {{ limpio: string, cantidad: number }}
 */
export function sanearAnsi(texto) {
  return quitarYContar(String(texto ?? ''), ANSI);
}

/**
 * Remueve Unicode invisible. Reporta por categoria, no por code point.
 * @param {string} texto
 * @returns {{ limpio: string, hallazgos: Array<{ nombre: string, cantidad: number }> }}
 */
export function sanearUnicode(texto) {
  let limpio = String(texto ?? '');
  const hallazgos = [];
  for (const cat of CATEGORIAS) {
    const r = quitarYContar(limpio, cat.re);
    if (r.cantidad === 0) continue;
    hallazgos.push({ nombre: cat.nombre, cantidad: r.cantidad });
    limpio = r.limpio;
  }
  return { limpio, hallazgos };
}

/**
 * Sanea un texto: ANSI y despues Unicode.
 * @param {string} texto
 * @returns {{
 *   limpio: string,
 *   hallazgosUnicode: Array<{ nombre: string, cantidad: number }>,
 *   cantidadAnsi: number,
 *   tuvoHallazgos: boolean
 * }}
 */
export function sanear(texto) {
  const ansi = sanearAnsi(texto);
  const unicode = sanearUnicode(ansi.limpio);
  return {
    limpio: unicode.limpio,
    hallazgosUnicode: unicode.hallazgos,
    cantidadAnsi: ansi.cantidad,
    tuvoHallazgos: unicode.hallazgos.length > 0 || ansi.cantidad > 0,
  };
}
