# Prototipo de lógica (Discovery)

Un único HTML autocontenido con botones que deja a un **no-dev** (un PM, un experto de dominio)
manejar un modelo de reglas y ver qué pasa. Usalo cuando la pregunta es sobre **reglas de negocio
o estados**: eso que parece razonable en una reunión y recién se siente mal cuando lo empujás por
casos reales.

Si la pregunta es "cómo se ve", es la otra rama: [ui.md](ui.md).

## Cuándo es la forma correcta

- "¿Qué pasa con la seña si el cliente reprograma dos veces y después cancela?"
- "¿Estas reglas de descuento se contradicen en algún caso?"
- Cualquier regla de negocio donde alguien quiera **apretar botones y ver el resultado**.

## Proceso

1. **Enunciá la pregunta** arriba del HTML, en lenguaje de negocio y visible (no en un comentario).
2. **Modelá las reglas** en un `<script>` inline, separadas de los botones: las reglas de un lado,
   la pantalla del otro. En Discovery el módulo **no se levanta a ningún lado** (es pre-codebase);
   separarlo es para que se lea claro y para que desarrollo, más tarde, lo tome de referencia.
3. **Armá la pantalla**, de arriba hacia abajo: título + la pregunta; un panel de **estado actual**
   (campos etiquetados, no un volcado de JSON); **botones de free-play** (uno por acción, en
   lenguaje de negocio); y **escenarios guiados** por tabs para los casos difíciles. Después de
   cada clic, re-renderizá el estado completo y marcá qué cambió.
4. **Pasáselo al experto de dominio.** Lo valioso es el *"pará, eso no debería poder pasar"*: ahí
   está el agujero en la **regla**, que es todo el punto.

## Captura

El **veredicto** (qué regla quedó decidida, en una frase) se lleva a `## Reglas de negocio` o
`## DONE CRITERIA` de la feature, vía `/dsc-prototype`. El HTML de lógica normalmente **se tira**:
no es un diseño de pantalla, es para sentir las reglas.

## Reglas técnicas (constitución)

- Un archivo, doble clic, **CSP de `lib/render.mjs`** (`default-src 'none'; script-src
  'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;`) o queda en blanco (DEC-005).
- Sin red, sin dependencias, sin persistencia. Estado en memoria. Fuentes de sistema.
- Texto que venga de `ideas/` o de un artefacto: al cliente por `textContent`, escapado.
- Escribí dentro de `proyectos/<slug>/`.

## Anti-patterns

- **Sin tests, sin pulido**: es para aprender rápido y tirar.
- **No lo cablees a un sistema real**: es sobre las reglas, no sobre la integración.
- **Lenguaje de negocio, no de código**: botones y estado se leen como el negocio, no como el
  reducer.
