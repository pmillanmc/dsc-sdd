---
name: prototyping
description: Armar un prototipo descartable para contestar UNA pregunta de diseño antes de congelar una feature — "¿estas reglas de negocio se sostienen?" o "¿cómo debería verse?". Produce un HTML autocontenido que un PM/PO abre con doble clic, y deja un veredicto (+ un .html de referencia si es de UI) que viaja a desarrollo. Pre-codebase: no deja código. Lo invoca /dsc-prototype.
---

# prototyping

Un prototipo es **algo descartable que contesta una pregunta de diseño**. La pregunta decide la
forma.

En Discovery se usa para **ver algo funcionando** antes de fijar una feature: es la salida natural
del BLOQUEADO (de `/dsc-refine` o `/dsc-features`) cuyo destrabador es *"ver algo funcionando"*, y
la forma **activa** de llenar el *Diseño de referencia* de UI/FLUJO. La gobernanza la maneja
`/dsc-prototype`; este skill es el **oficio**.

Dos cosas lo hacen distinto del prototipo de desarrollo:

- **Es pre-codebase.** No hay dónde "levantar" código: lo único que sobrevive es el **veredicto**
  (qué se decidió) y, si es de UI, el **`.html` de diseño** que viaja en `assets/` del handoff.
- **La audiencia es de negocio** (PM, PO, BA, el experto de dominio). Todo en lenguaje de negocio;
  el prototipo se maneja **clickeando**, sin tocar una terminal.

## Elegí la rama

- **"¿Estas reglas de negocio / este modelo de estado se sostienen?"** → [logica.md](logica.md).
  Un HTML suelto con botones que deja a un no-dev empujar las reglas por los casos difíciles.
- **"¿Cómo debería verse esto?"** → [ui.md](ui.md). Varias variantes sobre un HTML; el PM salta
  entre ellas y elige. La ganadora queda como el `.html` de referencia.

Si la pregunta es genuinamente ambigua, elegí por lo que se discute (reglas → lógica; pantalla →
UI) y declará el supuesto arriba del prototipo.

## Reglas que valen para las dos (constitución de Discovery)

El prototipo es un HTML generado por el modelo → obedece las mismas reglas que el dashboard y el
roadmap:

1. **Un solo archivo autocontenido, se abre con doble clic** (`file://`). Sin server, sin build.
2. **La CSP exacta de `lib/render.mjs`**, o la página queda **en blanco** (la trampa de DEC-005):
   `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;`
   en un `<meta http-equiv="Content-Security-Policy">`. **Reusá `shellHtml()` de `lib/render.mjs`**
   si podés; si lo escribís a mano, copiá esa cabecera tal cual.
3. **Sin red, sin CDN, sin dependencias, sin fetch.** `default-src 'none'` implica `connect-src
   'none'`: todo inline. Fuentes de sistema (`FUENTES_SISTEMA`). Imágenes solo `data:`.
4. **Sin persistencia.** El estado vive en memoria (coincide con la CSP: no hay red ni storage).
5. **Datos escapados.** Cualquier texto que venga de `ideas/` o de un artefacto es no confiable:
   al cliente por `textContent`, nunca `innerHTML`.
6. **Descartable y en lenguaje de negocio.** Botones y estado se leen como el negocio, no como
   código. Sin tests, sin pulido, sin abstracciones: es para aprender rápido y tirar.
7. **Escribí dentro de `proyectos/<slug>/`** — la constitución prohíbe escribir afuera.

## Capturá al terminar

Lo único que sobrevive:

- El **veredicto** en una frase → lo lleva `/dsc-prototype` a la feature: a `## UI / FLUJO`, a
  `## Reglas de negocio` o a `## DONE CRITERIA`, según la pregunta.
- Si fue de UI: la variante ganadora como
  `proyectos/<slug>/outputs/features/assets/<archivo>.html`, registrada en el campo *Diseño de
  referencia*. Viaja a desarrollo y `/sdd-refine` extrae sus valores exactos.

El resto del prototipo **se tira**. No hay rama git ni registro: en Discovery lo durable es el
asset y el veredicto, no el código.
