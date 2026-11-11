---
description: Prototipo descartable para contestar una pregunta de diseño antes de congelar una feature — "¿estas reglas se sostienen?" o "¿cómo debería verse?". Deja un veredicto y, si es de UI, el .html de referencia que viaja a desarrollo. Opcional, fuera de la cadena.
---

# /dsc-prototype

Comando **opcional y fuera de la cadena**. No genera un artefacto de la cadena: arma un prototipo
descartable para **ver algo funcionando** antes de fijar una feature, y deja un veredicto que
alimenta el brief. El oficio lo tiene la skill `prototyping` (dos ramas: lógica y UI); este comando
es la costura de gobernanza alrededor.

Se usa, sobre todo, durante `/dsc-features` cuando toca el **Diseño de referencia** (pregunta 5 de
UI/FLUJO): en vez de solo preguntar *"¿tenés un `.html`?"*, lo armás. También destraba un
`BLOQUEADO` de `/dsc-refine` cuyo destrabador es *"ver algo funcionando"*.

## Cuándo usarlo

Cuando hay una **pregunta de diseño sin precedente** y la respuesta depende de verla:

- "¿Estas reglas de negocio / este modelo se sostienen?" → rama lógica
- "¿Cómo debería verse esta pantalla?" → rama UI

NO lo uses para definir arquitectura o tareas (eso es desarrollo), ni para algo que ya está claro
en palabras (no hay nada que ver).

## Gate

- Tiene que existir un proyecto (`proyectos/<slug>/`).
- Enunciá en una línea la **pregunta** que el prototipo contesta. Sin pregunta, no hay prototipo.

No hay gate de etapa: es off-cycle. No toca `workflow-status.json`, no reclama (`claimed_by`) ni
dispara la cascada `STALE`.

## Proceso

1. **Elegí la rama** e invocá la skill `prototyping` (`logica.md` o `ui.md`). Declará la pregunta
   arriba del prototipo.
2. **Construí el HTML** dentro de `proyectos/<slug>/`, autocontenido, con la **CSP de
   `lib/render.mjs`** (si no, queda en blanco — DEC-005). Abrilo con doble clic y mostráselo al
   humano.
3. **Iterá en lenguaje de negocio.** Lo valioso es el *"pará, eso no debería pasar"* (lógica) o el
   *"quiero la tabla de A con el encabezado de C"* (UI). Ajustá en el mismo loop.
4. **Cerrá con un veredicto**: qué se decidió, en una frase.

## Qué queda (la captura)

- **El veredicto** → se lleva a la feature: a `## UI / FLUJO`, a `## Reglas de negocio` o a
  `## DONE CRITERIA`, según la pregunta. Si venís de `/dsc-features`, volvé a ese comando (es
  reanudable) con la respuesta en la mano.
- **Si fue de UI:** la variante ganadora queda como
  `proyectos/<slug>/outputs/features/assets/<archivo>.html` y se registra en el campo *Diseño de
  referencia* de la feature. De ahí viaja en `assets/` del handoff y `/sdd-refine` extrae sus
  valores exactos.
- El resto del prototipo **se tira**. En Discovery lo durable es el asset y el veredicto, no el
  código (es pre-codebase): no hay rama ni registro que mantener.

## Reglas

- **Una pregunta por prototipo.** Si aparecen dos, son dos prototipos.
- **Lenguaje de negocio:** lo maneja un PM clickeando, no se toca una terminal.
- **No inventes la respuesta:** si no se puede ver todavía, es un `BLOQUEADO`, no un prototipo.

Al terminar, indicá el **próximo comando** — normalmente volver a `/dsc-features` (o `/dsc-refine`)
con el veredicto.
