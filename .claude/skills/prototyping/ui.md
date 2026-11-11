# Prototipo de UI (Discovery)

Varias variantes **estructuralmente distintas** de una pantalla, en un HTML que el PM abre y
recorre para elegir. La ganadora queda como el **`.html` de referencia** de la feature y viaja a
desarrollo.

Si la pregunta es sobre reglas, es la otra rama: [logica.md](logica.md).

## Cuándo es la forma correcta

- "¿Cómo debería verse esta pantalla / este dashboard?"
- "Quiero ver un par de opciones antes de comprometerme."

## Nota sobre la forma

En desarrollo, el prototipo de UI suele pegarse contra la app real. **En Discovery no hay app ni
codebase**, así que acá solo cabe el **mockup estático autocontenido**: datos falsos, un HTML,
variantes switcheables. Está perfecto — es lo mismo que el modelo ya hace con el dashboard.

## Proceso

1. **Enunciá la pregunta** y elegí N variantes (default 3, máx 5).
2. **Generá variantes estructuralmente distintas** —otro layout, otra jerarquía, otra affordance
   principal, no solo otro color— con **datos falsos idénticos** en todas. Read-only.
3. **Un switcher** para saltar entre variantes (un `?variant=` o botones en una barra). Mismo HTML.
4. **Pasáselo al PM.** El feedback valioso suele ser *"quiero la tabla de A con el encabezado de
   C"*: ese es el diseño real que querían, y no estaba en ninguna variante sola.

## Captura

- La **variante ganadora** se escribe como
  `proyectos/<slug>/outputs/features/assets/<archivo>.html` —un diseño limpio, no el multi-variante—
  y se registra en el campo *Diseño de referencia* de la feature. De ahí viaja en `assets/` del
  handoff y `/sdd-refine` extrae sus valores exactos (cascada CSS → valores efectivos).
- El **veredicto** (qué variante y por qué) se lleva a `## UI / FLUJO`.
- Las variantes perdedoras y el switcher **se tiran**.

## Reglas técnicas (constitución)

- Un archivo, doble clic, **CSP de `lib/render.mjs`** o queda en blanco (DEC-005). Reusá
  `shellHtml()` si podés.
- Sin red, sin CDN, sin web fonts (fuentes de sistema), sin dependencias. Imágenes solo `data:`.
- Datos de artefactos escapados, por `textContent`.
- Escribí dentro de `proyectos/<slug>/`.

## Anti-patterns

- **Variantes que difieren solo en color**: eso es un retoque, no un prototipo. Las variantes
  reales discrepan sobre la estructura.
- **Cablear a datos o mutaciones reales**: es sobre cómo se ve, con datos falsos.
- **Mandar el multi-variante como asset**: el asset es el **diseño elegido**, limpio — no el
  explorador con todas las variantes.
