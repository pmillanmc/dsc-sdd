---
description: Descompone un release aprobado en features independientes, con las seis secciones que el equipo de desarrollo consume.
---

# /dsc-features

El último comando de negocio antes del handoff. Lo que salga de acá determina si el equipo de
desarrollo tiene que volver a preguntar.

Seguí `contracts/command-anatomy.md`. Lo específico está abajo.

## Gate

La etapa `release` tiene que estar `APPROVED` y no `STALE`.

Si el usuario nombró un release, usá ese. Si hay varios aprobados y no nombró ninguno, preguntá
cuál descomponer.

## Contexto

Al subagente `feature-decomposer` pasale:

- `outputs/releases/R<n>.md`
- `outputs/vision/vision.md`, **solo la sección 3 (Usuarios Objetivo)**
- `templates/feature-template.md`
- `registry/features.yaml` y `registry/ids.yaml`

La visión entra únicamente por los usuarios. Es la excepción a "solo el antecesor directo" y está
declarada así en `contracts/chain.md`: sin las definiciones de `Unn`, la sección `## USUARIO` no se
puede completar.

## Reservar los IDs

Antes de generar, pedí los `Fnnn` a `registry/ids.yaml` con `lib/store.mjs`. **Nunca los infieras
contando archivos**: con dos personas trabajando en paralelo, ambas ven tres features y ambas
crean `F004`.

## El grilling de UI / FLUJO

Es la única sección que Discovery no puede derivar de nada, así que hay que preguntarla. Se
pregunta **acá y una sola vez**, con la visión y el roadmap en contexto — en vez de feature por
feature a ciegas en `/sdd-refine`. Mismo costo, mejor momento.

Una feature por vez, con `AskUserQuestion`:

1. **Pantallas** — ¿es una pantalla nueva, un cambio en una existente, o no tiene interfaz?
2. **Flujo principal** — paso a paso, desde dónde arranca el usuario hasta dónde termina
3. **Estado vacío** — qué ve cuando todavía no hay datos
4. **Estado de error** — qué ve cuando algo falla, y qué puede hacer al respecto
5. **Diseño de referencia** — ¿hay un `.html`, un wireframe, una captura? Si no hay y la feature lo
   amerita, ofrecé **prototiparlo** en vez de esperar un mockup: `/dsc-prototype` arma variantes
   que el PM elige, y la ganadora queda como el `.html` de referencia (ver la skill `prototyping`).
   Es la forma activa de contestar "cómo se ve". La misma ruta sirve para destrabar una regla de
   negocio dudosa (rama lógica) antes de fijar la feature.

Si hay un `.html` —traído o prototipado—, registralo en el frontmatter: viaja en `assets/` del
paquete de handoff, y `/sdd-refine` sabe resolver su cascada CSS para extraer los valores exactos.

Con muchas features, avisá el volumen antes de empezar y ofrecé cortar:

```
El release R1 tiene 3 épicas y salen unas 7 features. Por cada una te voy
a preguntar cómo se ve y cómo funciona — son 5 preguntas cortas cada una.

¿Las hacemos todas ahora, o arrancamos por las de EP001 y seguimos después?
```

El comando es reanudable: las features ya generadas quedan escritas.

## USUARIO no se pregunta

Se deriva de los `Unn` de la épica. Si el agente reporta que no puede derivarla, **es un bug de la
cadena, no una pregunta legítima**: significa que la visión, el roadmap o el release perdieron los
IDs de usuario. Reportalo y frená — preguntarlos acá enmascara el problema y lo repite en cada
feature futura.

## Verificaciones antes de escribir

Por cada feature:

- Las seis secciones del bloque SDD están, con los títulos **literales**
- `## USUARIO` tiene al menos un `Unn` que existe en la visión
- `## DONE CRITERIA` es verificable, no aspiracional
- `## RESTRICCIONES TÉCNICAS` no tiene ningún secreto: si hay credenciales, van como variable de entorno
- Sin placeholders
- Las dependencias entre features no tienen ciclos
- El ID viene del registro, no de contar archivos
- **El `depends_on` de cada feature hereda la dependencia de su épica.** Si la épica de la feature
  depende de otra épica, toda feature de la épica dependida que la habilite va en `depends_on`.
  Si la épica dependida no tiene features en este release, la dependencia queda declarada en
  `## RESTRICCIONES TÉCNICAS` como espera externa, con el release donde se resuelve

## Al presentar las features

Después de escribirlas, mostrá qué features quedan bloqueadas por otra y cuáles pueden arrancar ya.
Es lo primero que va a preguntar el equipo de desarrollo:

```
De las 8 features, 5 pueden arrancar en paralelo:

  F001 F002 F004 F006 F008   sin dependencias

  F003 espera a F001
  F005 espera a F002 y F003
  F007 espera a EP003 — que no está en este release (se resuelve en R2)

F007 se puede especificar ahora, pero no se puede terminar hasta R2.
```

Si ninguna feature depende de otra, decilo: **las 8 pueden arrancar en paralelo.**

## Cierre

Registrá cada feature en `registry/features.yaml` con estado `DRAFT`, emití un evento por feature
y regenerá el dashboard.

```
<n> features generadas para R1: F001 a F00<n>.
Próximo paso: revisarlas una por una.
/dsc-review
```

## Reglas

- Los seis títulos del bloque SDD son **literales**. Son los que `/sdd-refine` busca: cambiar una
  palabra o una tilde hace que el grilling se dispare igual y el Discovery no haya servido.
- Nada fuera del release. No modifiques su alcance.
- No tomes decisiones técnicas, no definas arquitectura ni tareas.
- No estimes: eso es `/dsc-estimate`.
- Si el release es ambiguo, el agente falla y no se genera ninguna feature.
