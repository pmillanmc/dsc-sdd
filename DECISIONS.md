# Registro de decisiones — Discovery Model

Este archivo registra cada vez que una decisión se aparta o amplía lo establecido en las specs
y en `constitution.md`. Sirve como trazabilidad entre lo que se especificó y lo que se construyó.

Lo escribe `/dsc-log`. Los IDs se reservan desde `registry/ids.yaml`.

## Índice

| ID | Título | Tipo | Estado | Fecha |
|---|---|---|---|---|
| DEC-001 | Extraer el escapado a `lib/render.mjs` en la fase 001 | Proceso | ACTIVE | 2026-08-03 |
| DEC-002 | El parser YAML solo acepta `[]` y `{}` como flow style | Técnica | ACTIVE | 2026-08-03 |
| DEC-003 | La unidad de trabajo es el proyecto, no el producto | Producto | ACTIVE | 2026-08-12 |
| DEC-004 | El límite de la iniciativa sube de 80 a 100 líneas | Proceso | ACTIVE | 2026-08-12 |
| DEC-005 | La CSP de los HTML usa `script-src 'unsafe-inline'`, no `'self'` | Técnica | ACTIVE | 2026-08-13 |
| DEC-006 | Los cinco límites de tamaño se recalibran contra artefactos reales | Proceso | ACTIVE | 2026-08-13 |
| DEC-007 | Los contadores de ID pasan de `products` a `proyectos`, con migración | Técnica | ACTIVE | 2026-08-14 |
| DEC-008 | Las dependencias entre épicas se declaran en una columna de la tabla del roadmap | Producto | ACTIVE | 2026-08-28 |
| DEC-009 | `started_at` se persiste en el estado, no solo como evento | Proceso | ACTIVE | 2026-08-28 |
| DEC-010 | Cambiar algo aprobado: dos caminos y un criterio — contradice o precisa | Producto | ACTIVE | 2026-08-31 |
| DEC-011 | Saneamiento determinista de Unicode invisible y ANSI en `ideas/` | Técnica | ACTIVE | 2026-09-15 |
| DEC-012 | Expansión del saneamiento Unicode: cinco categorías invisibles nuevas | Técnica | ACTIVE | 2026-09-21 |

---

## DEC-001

**Fecha:** 2026-08-03
**Tipo:** Proceso
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**feature_id:** 001-fundacion
**command_origin:** implementación de la fase 001

### Título

Extraer el escapado a `lib/render.mjs` en la fase 001

### Gap o motivo

`specs/001-fundacion/plan.md` ubicaba la serialización y el escapado dentro de
`scripts/gen-dashboard.mjs`, y `specs/003-ciclo-principal/plan.md` creaba `lib/render.mjs` recién
en la fase 003 para que el roadmap HTML lo reutilizara.

### Alternativas consideradas

1. Seguir el plan al pie: escapar dentro de `gen-dashboard.mjs` y extraerlo en la fase 003.
2. Crear `lib/render.mjs` desde la fase 001.

### Por qué se descartaron

La opción 1 implica escribir la lógica de escapado dos veces y moverla después. `constitution.md`
exige que todo dato se escape antes de entrar a un HTML; tener esa lógica en dos lugares durante
dos fases es exactamente el riesgo que la regla busca evitar.

### Decisión tomada

Se crea `lib/render.mjs` en la fase 001 con `jsonSeguro`, `esc`, `moduloDatos` y la constante `CSP`.
`gen-dashboard.mjs` lo consume. La tarea T001 de la fase 003 pasa de "crear" a "extender".

### Motivo

Un solo lugar donde se escapa es más seguro y más barato de auditar que dos. El costo de
adelantarlo es nulo.

### Artefactos modificados

`specs/003-ciclo-principal/tasks.md` T001 — de "crear" a "extender".

---

## DEC-002

**Fecha:** 2026-08-03
**Tipo:** Técnica
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**feature_id:** 001-fundacion
**command_origin:** implementación de la fase 001

### Título

El parser YAML solo acepta `[]` y `{}` como flow style

### Gap o motivo

`specs/005-audit/plan.md` declara el flow style (`{}` y `[]`) fuera del subconjunto soportado, con
fallo ruidoso. Al implementar el parser apareció que `depends_on: []` y `features: []` son la forma
idiomática de expresar una colección vacía, y que el propio `sdd-model` la usa en
`features.template.yaml`. Sin soportarla, `stringify` produciría algo que `parse` rechaza.

### Alternativas consideradas

1. Rechazar todo flow style y emitir las colecciones vacías como `clave:` sin valor.
2. Aceptar únicamente las formas vacías `[]` y `{}`.

### Por qué se descartaron

La opción 1 rompe el round-trip: `clave:` sin valor se lee como `null`, no como lista vacía, y el
audit no podría distinguir "sin dependencias" de "dependencias no declaradas". Además obliga a un
formato que nadie escribe a mano.

### Decisión tomada

`parse` acepta exactamente `[]` y `{}` como colecciones vacías. Cualquier otro flow style
(`{a: 1}`, `[x, y]`) sigue fallando ruidosamente con la línea exacta.

### Motivo

Se conserva la intención de la regla — que el parser no interprete mal en silencio una sintaxis
que no controla — sin romper el round-trip ni el formato idiomático.

### Artefactos modificados

`lib/yaml-min.mjs`, `specs/_registry/features.yaml` (se pasó `depends_on` de flow a lista en bloque).

---

## DEC-003

**Fecha:** 2026-08-12
**Tipo:** Producto
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**Proyecto:** global
**command_origin:** revisión de vocabulario durante la prueba punta a punta

### Título

La unidad de trabajo es el proyecto, no el producto

### Gap o motivo

El modelo llamaba "producto" a la unidad sobre la que se hace Discovery, y nombraba los
artefactos como "Visión de Producto" y "Product Roadmap". Ese vocabulario viene de product
management y no encaja con una fábrica de software, que define el alcance de **proyectos**
para clientes. Un PM leyendo "producto" piensa en algo que se vende, no en el trabajo que
tiene entre manos.

El error se arrastró desde el blueprint sin que nadie lo cuestionara, porque los templates
del modelo anterior ya usaban esa palabra.

### Alternativas consideradas

1. Dejarlo: "producto" es el término canónico en la literatura de discovery.
2. Renombrar a "proyecto" y agregar `cliente` como dato del proyecto.
3. Dos niveles de carpetas, `clientes/<cliente>/<proyecto>/`.

### Por qué se descartaron

La 1 privilegia la literatura sobre la audiencia real: si el modelo habla distinto que el
equipo, se nota en cada pantalla y erosiona la adopción. La 3 agrega un nivel de rutas que
hoy nadie necesita — un cliente con varios proyectos en Discovery simultáneo no es el caso
habitual, y el dato `cliente` alcanza para agrupar en el tablero.

### Decisión tomada

- `products/<slug>/` → `proyectos/<slug>/`
- ID de proyecto: `INI-nnn` → `PRY-nnn`. Desaparece la ambigüedad con `iniciativa.md`,
  que sigue siendo el nombre del primer artefacto
- `registry/initiatives.yaml` → `registry/proyectos.yaml`, con `slug`, `nombre` y `cliente`
- "Visión de Producto" → "Visión del Proyecto"
- `ideas/` pasa de la raíz a `proyectos/<slug>/ideas/`, para que los borradores de un
  proyecto no se mezclen con los de otro
- Los seis borradores de ejemplo que venían con el repo se movieron a `ejemplos/`

### Motivo

El modelo lo usan PM, PO y BA de una fábrica de software. Si el vocabulario no es el de
ellos, cada comando les pide una traducción mental. Se hizo ahora porque no existe todavía
ningún proyecto real: después habría que migrar datos además de código.

### Artefactos modificados

98 archivos: los 28 comandos, los 9 agentes, los 8 contratos, los 7 templates, las 6
librerías, los 13 scripts, la configuración, los registros, el tablero, las specs y la
documentación.

### Impacto en la cadena

Ninguno: no había proyectos creados. El smoke test y el audit pasan limpios después del
cambio.

---

## DEC-004

**Fecha:** 2026-08-12
**Tipo:** Proceso
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**Proyecto:** global
**command_origin:** /dsc-review sobre la primera iniciativa real

### Título

El límite de la iniciativa sube de 80 a 100 líneas

### Gap o motivo

La primera iniciativa real del modelo cerró en 83 líneas después de dos rondas de recorte.
El check 11 del audit la marcó por exceder el límite de 80.

Al medirlo se ve que el número nunca salió de una medición: el template obliga a 7 secciones
más los supuestos declarados, y entre frontmatter, títulos y líneas en blanco la estructura
sola consume unas 37 líneas. Quedan ~46 para el contenido de las siete categorías, con una
tabla de usuarios de 5 columnas adentro. Son unas 6 líneas por categoría.

Bajar de 83 a 80 exigía borrar contenido con valor: los supuestos declarados, el pendiente
de pacientes homónimos, o la dependencia de la API de WhatsApp.

### Alternativas consideradas

1. Recortar tres líneas más de contenido para cumplir el límite.
2. Dejar el aviso abierto como deuda visible y no tocar nada.
3. Subir el límite a 100 líneas.

### Por qué se descartaron

La 1 sacrifica información que va a hacer falta aguas abajo para satisfacer un número que no
se derivó de ninguna medición. La 2 deja un aviso permanente en todos los proyectos, y un
aviso que siempre está encendido deja de leerse.

### Decisión tomada

El límite de `iniciativa.md` pasa de 80 a **100 líneas**. Actualizado en `constitution.md`,
`lib/registry.mjs`, `templates/iniciativa-template.md`, `/dsc-refine`, la referencia
`artifact-quality.md` del skill y `docs/blueprint.md`.

Los otros límites no se tocan: no hay evidencia todavía. **El de release (80) tiene la misma
estructura de 7 secciones y probablemente el mismo problema** — se revisa cuando exista el
primer release real, no antes.

### Motivo

El número original se fijó en el blueprint sin haber escrito nunca un artefacto completo. La
primera corrida real es la primera medición disponible, y muestra que 80 no alcanza para lo
que el propio template exige.

El límite sigue existiendo por la razón por la que se puso: un artefacto largo infla el
contexto del agente en cada etapa posterior. 100 sigue siendo un techo, no una licencia.

### Artefactos modificados

6 archivos del modelo. Ninguno de proyecto.

### Impacto en la cadena

Ninguno. `proyectos/proyecto-1/iniciativa.md` pasa a cumplir el límite sin cambios: el audit
devuelve 0 errores y 0 avisos.

---

## DEC-005

**Fecha:** 2026-08-13
**Tipo:** Técnica
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**Proyecto:** global
**command_origin:** el tablero se abría en blanco

### Título

La CSP de los HTML generados usa `script-src 'unsafe-inline'` y no `'self'`

### Gap o motivo

`dashboard/index.html` se abría completamente en blanco. El archivo tenía 17 KB de HTML y los
datos estaban bien generados: no faltaba nada.

La cabecera de seguridad decía `script-src 'self'`. Estos archivos se abren con doble clic, o
sea `file://`, y un documento `file://` tiene origen opaco: `'self'` no coincide con nada. El
navegador bloqueaba el `<script src="./data.js">` **y** el script inline que dibuja el tablero.
Como todo el contenido se dibuja por JavaScript, no quedaba nada visible salvo el título.

Peor: el bloqueo es silencioso. No hay mensaje de error en la página. El síntoma es una
pantalla en blanco, que se confunde con "no hay datos".

`'self'` es una regla escrita para `https://` puesta en una página que por decisión de
arquitectura nunca se sirve por HTTP. El mismo error estaba en `roadmap.html`.

### Alternativas consideradas

1. Servir el tablero por HTTP desde un servidor local.
2. Firmar los scripts inline con hashes `sha256-` en la CSP.
3. `script-src 'unsafe-inline'` y hacer que todo HTML generado sea autocontenido.

### Por qué se descartaron

La 1 contradice el principio de cero servidores de `constitution.md`: nada del modelo abre un
puerto en la máquina de un PM.

La 2 es la opción técnicamente más estricta y era la primera candidata. Se descartó por algo
concreto: no hay navegador en este entorno para verificarla. Un hash mal calculado por un byte
vuelve a dar exactamente la misma pantalla en blanco, y no había forma de comprobar el arreglo
antes de entregarlo. Entregar un control que falla en silencio hacia el mismo síntoma que se
está corrigiendo no es aceptable.

### Decisión tomada

La CSP pasa a `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data:;` en `lib/render.mjs` y en `dashboard/shell.html`.

El tablero pasa a ser autocontenido. `dashboard/index.html` deja de editarse a mano y pasa a
generarse: `gen-dashboard.mjs` lee `dashboard/shell.html`, le inyecta los datos inline y
escribe el `index.html`. `data.js` se sigue escribiendo, con los mismos datos de la misma
corrida, para que otros comandos lo lean.

### Motivo

`'unsafe-inline'` no debilita lo que esta CSP tiene que garantizar. La amenaza registrada es
S11 del blueprint: que un dato de artefacto inyecte código y ese código llame a internet. Lo
que lo impide es `default-src 'none'`, que implica `connect-src 'none'`, y eso queda intacto.
Aun con una inyección exitosa no hay canal de salida.

El control contra la inyección en sí nunca fue la CSP: es `jsonSeguro()` escapando `<`, `>`,
U+2028 y U+2029, más `textContent` en el cliente. Los dos siguen en su lugar.

Con un archivo autocontenido, el único script que puede correr es el que el generador ya
escribió. Quien pueda inyectar un `<script>` ahí adentro ya controla el archivo.

Beneficio lateral: un solo archivo sin dependencias se manda por mail o se sube a SharePoint y
sigue funcionando. Para la audiencia del modelo, eso importa.

### Artefactos modificados

`lib/render.mjs`, `dashboard/shell.html` (era `index.html`), `scripts/gen-dashboard.mjs`,
`scripts/check-env.mjs`, `scripts/smoke.mjs`, `contracts/paths.md`,
`.claude/commands/dsc-dashboard.md`, `.claude/agents/dashboard.md`. Se eliminó
`dashboard/vendor/`, que estaba vacío.

### Impacto en la cadena

Ninguno sobre los artefactos de proyecto. `roadmap.html` se regeneró y quedó con la CSP nueva.

El smoke suma tres verificaciones sobre el tablero generado: que los datos estén inline, que no
haya ningún `<script src>`, y que la CSP no vuelva a traer `'self'` ni pierda `default-src
'none'`. Se comprobaron rompiendo la CSP a propósito: el paso falla con el mensaje correcto.

### Pendiente

**El arreglo no se verificó en un navegador**, porque este entorno no tiene ninguno. El
diagnóstico y el arreglo se sostienen sobre el comportamiento documentado de CSP con origen
opaco. Abrir `dashboard/index.html` con doble clic es la confirmación que falta.

Vale registrar que el criterio de aceptación de `specs/001-fundacion/spec.md` decía "abro
index.html con doble clic y carga sin errores". Se dio por cumplido sin abrirlo nunca.

---

## DEC-006

**Fecha:** 2026-08-13
**Tipo:** Proceso
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**Proyecto:** global
**command_origin:** recalibración al cerrar la primera cadena completa

### Título

Los cinco límites de tamaño se recalibran contra artefactos reales

### Gap o motivo

DEC-004 subió el límite de la iniciativa y dejó dicho que los otros cuatro se revisarían
cuando existiera evidencia, no antes. La cadena completa de PRY-001 ya existe: es la evidencia.

Medidos contra la primera corrida real:

| Artefacto | Límite viejo | Plantilla vacía | Real | Veredicto |
|---|---|---|---|---|
| iniciativa | 100 | 83 | 83 | correcto, ya ajustado en DEC-004 |
| visión | 120 | 130 | 129 | **el límite está por debajo de la plantilla vacía** |
| roadmap | 150 | 127 | 162 | apretado |
| release | 80 | 98 | 104 | **el límite está por debajo de la plantilla vacía** |
| feature | 100 | 135 | 98 | se cumple por 2 líneas |

El hallazgo que decide la cuestión no es que los artefactos se pasen: es que **la visión y el
release tenían un límite menor que su propia plantilla en blanco**. Ningún artefacto podía
cumplirlos jamás. Un aviso que se enciende siempre no informa nada, y termina entrenando a
quien lo lee para ignorarlo — el mismo razonamiento por el que `Pendiente` y `N/A` salieron de
la lista de placeholders.

DEC-004 anticipó exactamente esto para el release: *"tiene la misma estructura de 7 secciones
y probablemente el mismo problema"*. Lo tenía.

### Alternativas consideradas

1. Recortar los artefactos reales hasta que entren.
2. Poner límites por fórmula, en función de la cantidad de épicas, usuarios o features.
3. Recalibrar los cinco números contra lo observado, con una regla explícita.

### Por qué se descartaron

La 1 es imposible para la visión y el release: ni siquiera vacíos entran.

La 2 es la respuesta correcta en el fondo —la visión escala con usuarios y capacidades, el
roadmap con épicas— pero agrega una capa de configuración para resolver un problema que
todavía no se midió con más de un proyecto. Se puede hacer después, con datos.

### Decisión tomada

Regla de calibración: **el artefacto más grande observado más 25%, redondeado a la decena.**

| Artefacto | Antes | Ahora |
|---|---|---|
| iniciativa | 100 | 100 |
| visión | 120 | **160** |
| roadmap | 150 | **200** |
| release | 80 | **130** |
| feature | 100 | **120** |

La regla reproduce los cinco valores, incluido el 100 de la iniciativa que ya estaba fijado por
DEC-004. No son números elegidos uno por uno para que los avisos desaparezcan.

### Motivo

El límite sigue existiendo por lo mismo de siempre: un artefacto largo infla el contexto del
agente en cada etapa posterior. El 25% es el margen para que un proyecto algo más grande no
dispare un aviso, sin dejar de marcar al que se desbordó de verdad.

La base de calibración es un solo proyecto: 3 usuarios, 5 capacidades, 6 épicas, 8 features.
Está anotada en `lib/registry.mjs`. Con un proyecto sensiblemente más grande hay que volver
sobre esto, probablemente por el camino de la alternativa 2.

### Artefactos modificados

`constitution.md`, `lib/registry.mjs`, las cuatro plantillas de visión, roadmap, release y
feature, los cuatro agentes creadores, `/dsc-vision`, `docs/blueprint.md`,
`specs/003-ciclo-principal/spec.md` y la referencia `artifact-quality.md` del skill.

En esa misma referencia se corrigió la lista de placeholders, que seguía nombrando `Pendiente`
y `N/A` después de que salieran del código.

### Impacto en la cadena

Ningún artefacto de proyecto cambia. Los 3 avisos del check 11 desaparecen.

---

## DEC-007

**Fecha:** 2026-08-14
**Tipo:** Técnica
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**Proyecto:** global
**command_origin:** limpieza de la carpeta del modelo

### Título

Los contadores de ID pasan de `products` a `proyectos`, con migración

### Gap o motivo

DEC-003 fijó que la unidad de trabajo es el proyecto y renombró el vocabulario en 98 archivos.
La clave `products` de `registry/ids.yaml` quedó afuera: es donde viven los contadores de ID por
proyecto, y seguía nombrada con la palabra que esa decisión vino a eliminar.

Convivían además dos claves para lo mismo. `ids.yaml` tenía un `proyectos: {}` vacío que ningún
código lee —quedó de una edición parcial del rename— y que `writeYaml` venía arrastrando intacto
en cada round-trip, porque el parser conserva las claves que no toca.

El residuo estaba en seis lugares: `lib/store.mjs`, `lib/registry.mjs`,
`scripts/discovery-audit.mjs`, `contracts/ids.md`, `.claude/agents/dashboard.md` y el propio
`registry/ids.yaml`.

### Alternativas consideradas

1. Dejarlo: es interno, funciona, ningún PM lo ve.
2. Renombrar la clave y listo.
3. Renombrar con una función de migración que fusione la clave vieja.

### Por qué se descartaron

La 1 deja dos vocabularios para la misma cosa dentro del código, que es exactamente lo que
DEC-003 vino a resolver. El costo no lo paga el PM, lo paga el próximo que lea `store.mjs`.

La 2 es la peligrosa, y por eso no se tomó. Un `ids.yaml` que se haya quedado con el nombre
viejo —una copia del modelo en otra máquina, una carpeta sincronizada que no recibió el cambio—
se leería como "sin contadores". La próxima reserva devolvería `F001` para un proyecto que ya
tiene ocho features, y el choque de IDs se descubriría recién cuando el audit marque features
duplicadas, con artefactos ya escritos.

### Decisión tomada

La clave pasa a llamarse `proyectos`. `lib/store.mjs` exporta `normalizarContadores()`, que
fusiona `products` dentro de `proyectos` si aparece y borra la vieja, de modo que el próximo
`writeYaml` deje el archivo migrado. La usan `reservarIds()` y `leerContadores()`, los dos
únicos puntos de entrada a ese archivo.

`registry/ids.yaml` se migró corriendo esa misma función, no editándolo a mano. El contador de
`proyecto-1` quedó en `F: 8`, verificado antes y después.

### Motivo

Un rename de vocabulario no debería poder corromper datos. La función de migración cuesta seis
líneas y convierte un cambio riesgoso en uno inerte: cualquier copia del modelo se arregla sola
la primera vez que reserva un ID.

Se puede sacar cuando no queden copias con el formato viejo. Hasta entonces, se queda.

### Artefactos modificados

`lib/store.mjs`, `lib/registry.mjs`, `scripts/discovery-audit.mjs`, `contracts/ids.md`,
`.claude/agents/dashboard.md`, `registry/ids.yaml`.

### Impacto en la cadena

Ninguno. El audit devuelve los mismos 0 errores y 14 avisos que antes del cambio, y el smoke
pasa los once pasos.

---

## DEC-008

**Fecha:** 2026-08-28
**Tipo:** Producto
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**Proyecto:** global
**command_origin:** fix de visualización de dependencias entre épicas

### Título

Las dependencias entre épicas se declaran en una columna de la tabla del roadmap

### Gap o motivo

El modelo ya consideraba las dependencias entre épicas —`/dsc-roadmap` validaba que ninguna se
planificara antes que aquello de lo que depende, y que no hubiera ciclos— pero **no las mostraba**.
Solo aparecían en el bloque conversacional de ordenamiento, y después había que pedirlas con
`/dsc-impact`, que es informativo y hay que saber que existe.

La causa no era falta de lógica: las dependencias de épicas no tenían hogar estructurado. Vivían
como prosa en el campo `**Dependencias**` del bloque de cada épica. La tabla del roadmap —que es
lo que lee `scripts/gen-roadmap.mjs` para la vista ejecutiva— tenía seis columnas y ninguna era
dependencias. Consecuencias: el HTML que mira el PO no las mostraba, `/dsc-release` y
`/dsc-features` las validaban en silencio, y el audit no podía verificar ciclos entre épicas
porque no había dato que leer.

Las features sí las tenían resueltas: `depends_on` en `registry/features.yaml`, verificado por el
chequeo 4. La asimetría era el problema.

### Alternativas consideradas

1. Dejarlas como prosa y mejorar solo el texto de los comandos.
2. Crear un `registry/epics.yaml` espejo de `registry/features.yaml`.
3. Agregar una columna a la tabla del roadmap, que ya es el contrato que lee el generador.

### Por qué se descartaron

La 1 no arregla nada verificable: la prosa no se puede dibujar ni auditar, y el pedido era
justamente que se vea sin correr un comando.

La 2 es la tentadora y es la que hay que evitar. Crea una segunda copia de la misma verdad —la
épica quedaría declarada en el roadmap y en un registro— que alguien tiene que mantener
sincronizada a mano. Es la misma clase de problema que DEC-007 vino a limpiar.

### Decisión tomada

1. **La columna `Depende de` es la última de la tabla del roadmap y no se reordena.** Lleva IDs de
   épica separados por coma, o `—`. Va al final por compatibilidad: `gen-roadmap.mjs` acepta seis
   columnas o más, así que un roadmap generado antes de este cambio sigue funcionando. Insertada en
   el medio, rompía todos los roadmaps existentes.
2. **Es épica→épica.** Las dependencias externas o estratégicas siguen en la sección
   "Dependencias estratégicas" con ID `DE-nnn`. Son conceptos distintos y no se mezclan.
3. **El parser vive en `lib/roadmap.mjs`, no en el generador.** Hay dos consumidores —la vista
   ejecutiva y el chequeo 16— y con el parser duplicado un cambio de formato dejaría a uno de los
   dos leyendo mal en silencio.
4. **El chequeo 16 es opt-in por presencia de la columna.** Un roadmap que no la declara no se
   audita. Sin eso, agregar el chequeo pondría rojo retroactivamente a todo proyecto ya aprobado,
   que estaba verde y no cambió.
5. **Se muestra en tres puntos del ciclo**, no solo a pedido: al cerrar `/dsc-roadmap` (qué
   dependencias generan espera entre trimestres), al seleccionar épicas en `/dsc-release` (si la
   dependencia entra en el release o queda afuera), y en la vista ejecutiva HTML, con ↗ cuando
   cruza de trimestre y ? cuando apunta a una épica inexistente.

### Motivo

Una dependencia que cruza de trimestre es la única que cuesta tiempo de calendario, y es una
decisión de negocio: se toma con el PO mirándola, no se valida en silencio. Las de dentro del
mismo trimestre son orden de trabajo, no espera.

El cambio aplica **solo hacia adelante**. Editar un `roadmap.md` ya aprobado para agregarle la
columna lo marcaría como modificado a mano en el chequeo 12, que es semánticamente falso: el
artefacto no se alteró, el template evolucionó.

### Artefactos modificados

`lib/roadmap.mjs` (nuevo), `scripts/gen-roadmap.mjs`, `scripts/discovery-audit.mjs`,
`scripts/smoke.mjs`, `templates/roadmap-template.md`, `fixtures/cadena.md`,
`.claude/commands/dsc-roadmap.md`, `.claude/commands/dsc-release.md`,
`.claude/commands/dsc-features.md`, `.claude/commands/dsc-status.md`.

### Impacto en la cadena

Ninguno sobre lo existente. El audit devuelve los mismos 0 errores y 14 avisos que antes del
cambio —el chequeo 16 saltea el roadmap de seis columnas de `proyecto-1`— y el smoke pasa los
catorce pasos, incluidos los dos casos nuevos: un ciclo entre épicas que tiene que fallar, y un
roadmap sin la columna que el chequeo tiene que ignorar.

---

## DEC-009

**Fecha:** 2026-08-28
**Tipo:** Proceso
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**Proyecto:** global
**command_origin:** fix de fechas de inicio y fin de etapa

### Título

`started_at` se persiste en el estado, no solo como evento, y es de la versión en curso

### Gap o motivo

El pedido era registrar fecha de inicio (cuando se dispara el comando) y de fin (cuando el PO
aprueba). Al medirlo contra el código, la mitad "fin" ya estaba resuelta y mejor que el pedido:
`scripts/approve.mjs` escribe `approved_at` al completarse la aprobación, y `approvals` guarda
además la fecha de cada firma por rol. Nada de eso se mostraba en ningún lado.

La mitad "inicio" estaba a medias, y de una forma difícil de ver. El evento `STAGE_STARTED` **sí**
se emitía —el log de `proyecto-1` tiene uno por etapa, de `/dsc-new`, `/dsc-vision`,
`/dsc-roadmap`, `/dsc-release` y `/dsc-features`— pero `started_at` no existía en ninguna parte del
repo. La fecha vivía únicamente en `events.jsonl`, que es append-only y hay que recorrer entero
para consultarlo. Resultado: `/dsc-status` y el tablero, que leen el estado, no tenían de dónde
sacarla.

Se descartó de entrada una hipótesis previa que resultó falsa: que las métricas `stageTime` y
`flowEfficiency` estuvieran calculando sobre un conjunto vacío. Calculan bien
(`stageTime: 0.07`, `flowEfficiency: 29.6`) porque leen el evento, no el estado.

### Alternativas consideradas

1. Dejar la fecha solo en el evento y hacer que `/dsc-status` y el tablero recorran `events.jsonl`.
2. Persistir `started_at` en el estado, además del evento.
3. Guardar el inicio de cada versión en una lista dentro del estado.

### Por qué se descartaron

La 1 obliga a cada consumidor a recorrer un log append-only para responder "¿cuándo arrancó esto?",
que es la pregunta más frecuente del tablero. El estado existe justamente para eso.

La 3 duplica lo que `events.jsonl` ya guarda con más detalle, y crea dos historiales que hay que
mantener coherentes.

### Decisión tomada

1. **`marcarInicio()` en `lib/cascade.mjs` hace las dos cosas en una sola llamada**: escribe
   `started_at` y `started_by` en el estado y emite `STAGE_STARTED`. No se pueden hacer por
   separado, que es como se llegó a tener el evento sin el campo.
2. **Se llama antes de la primera pregunta al humano**, no al cerrar. Un comando interrumpido a
   mitad de conversación conserva su inicio. Está en `contracts/command-anatomy.md` como paso 2b,
   así aplica a todos los comandos sin repetirlo en cada uno.
3. **`started_at` es de la versión en curso.** Regenerar una etapa lo resetea. El histórico
   completo sigue en `events.jsonl`, que nunca se reescribe: una sola fuente de verdad por pregunta.
4. **Fin es la última firma requerida, no la del PO.** `config/review-policy.yaml` puede pedir
   varios roles y `approved_at` se escribe cuando firma el último. La fecha de un rol concreto no
   se pierde: está en `approvals[rol].at`.
5. **`cronologia` en `project-metrics.json`** lleva una fila por etapa con inicio, aprobación y
   días. Se llama así y no `etapas` porque `gen-dashboard.mjs` hace `{ ...m, etapas }` con las
   definiciones del workflow: un campo llamado `etapas` quedaría sobreescrito en silencio y el
   tablero mostraría las etapas sin una sola fecha, sin que nada falle.
6. **El chequeo 17 solo reporta lo verificablemente inconsistente, nunca lo ausente.** Etapa
   `APPROVED` sin `approved_at`, fecha inválida, o inicio posterior a la aprobación. La **falta**
   de `started_at` no se reporta: las etapas cerradas antes de este cambio no lo tienen, y un
   chequeo que lo exigiera pondría en amarillo a todo proyecto ya aprobado el día que se agrega.

### Motivo

El valor del fix no era el dato, era la visibilidad. Una etapa en revisión hace nueve días es un
problema, y no se ve mirando el estado: se ve mirando la fecha. Por eso el punto 2 —escribir antes
de preguntar— importa más que el resto: sin eso, toda corrida interrumpida queda sin inicio y el
tiempo de la etapa se calcula mal justo en los casos que hay que detectar.

Y por eso el punto 6: un chequeo nuevo que pone amarillo lo que ya estaba cerrado enseña al equipo
a ignorar el audit, que es la única verificación determinista que tiene el modelo.

### Artefactos modificados

`lib/cascade.mjs`, `lib/metrics.mjs`, `scripts/discovery-audit.mjs`, `scripts/smoke.mjs`,
`dashboard/shell.html`, `contracts/state.md`, `contracts/command-anatomy.md`,
`.claude/commands/dsc-status.md`.

### Impacto en la cadena

Ninguno sobre lo existente. El audit devuelve los mismos 0 errores y 14 avisos —el chequeo 17 no
emite nada sobre `proyecto-1`, que no tiene `started_at` en ninguna etapa— y el smoke pasa los
dieciocho pasos. En `proyecto-1` la cronología muestra las fechas de aprobación que ya existían y
deja el inicio vacío, sin inventarlo.

---

## DEC-010

**Fecha:** 2026-08-31
**Tipo:** Producto
**Estado:** ACTIVE
**Responsable:** Patricio Millán
**Proyecto:** global
**command_origin:** fix de cambios sobre discovery ya generado

### Título

Cambiar algo aprobado se resuelve con dos caminos y un solo criterio: contradice o precisa

### Gap o motivo

`/dsc-change` existía pero era la puerta de atrás. Declaraba un techo de cuatro condiciones que
evaluaba el agente con criterio propio, y no gestionaba ninguna de las cinco cosas que un cambio
sobre algo firmado tiene que mover. Grepeado, el comando no mencionaba `hash`, `claimed_by`,
`emitirEvento`, `ARTIFACT_UPDATED`, `audit` ni `marcarStale`: cero de seis.

El resultado está en los datos. En `proyecto-1`, F003 a F008 figuran `APPROVED` en `version: 1` con
el contenido cambiado. Si hubieran pasado por el comando estarían en v2. Se editaron a mano, sin
comando, y quedaron aprobadas con contenido que nadie firmó. Nadie se enteró por meses: el chequeo
12 lo reporta como aviso y nada lo mostraba.

Al medir qué faltaba realmente, apareció que casi todo ya estaba: `approve.mjs` ya llama a
`marcarStale` y recalcula el hash al firmar, `habilitaSiguiente` ya bloquea aguas abajo,
`outputs/history/` ya archiva cada versión, el chequeo 12 ya saltea lo que no está `APPROVED`, y el
gate de `contracts/command-anatomy.md` ya contempla regenerar un artefacto aprobado. **Faltaba una
sola pieza: la transición de `APPROVED` a `IN_REVIEW`.**

### Alternativas consideradas

1. Techo computable que rechaza el cambio cuando la cascada excede al propio ítem, más un script de
   dos fases con `--check` y `--apply`.
2. Nada de código: que `/dsc-status` muestre el chequeo 12 y que el comando derive al ciclo
   `review → approve` que ya existe.
3. Un script mínimo que hace solo la transición, más un intake que clasifica entre ajustar y
   regenerar.

### Por qué se descartaron

La 1 era sobre-ingeniería y rechazaba en vez de guiar. El techo sobra: si la transición es honesta,
el costo se hace evidente solo —el subárbol va a `STALE` y nada avanza—, así que el mecanismo ya
castiga bien la elección equivocada. Le estaba agregando política donde alcanzaba la mecánica. Y
exigía que la persona ya supiera qué artefacto tocar, que es justo lo que no sabe.

La 2 deja el estado mintiendo entre la edición y la re-firma: el artefacto dice `APPROVED` y los
comandos de abajo avanzan igual. Cambia una garantía por un aviso.

### Decisión tomada

1. **Dos caminos, no uno con techo.** `/dsc-change` es el punto de entrada que pregunta qué se
   quiere cambiar en lenguaje de negocio, mapea a la cadena, y decide entre **ajustar** y
   **regenerar**. Regenerar deja de ser el castigo por pasarse del techo y pasa a ser la opción
   recomendada cuando el cambio es grande: son cuatro comandos, contra parchear veinte artefactos.
2. **Un solo criterio: ¿contradice a un antecesor, o lo precisa?** Contradice → regenerar desde ese
   antecesor. Precisa → ajustar. No es volumen de artefactos: cambiar el canal de notificación toca
   dos features pero contradice una capacidad del roadmap, y parchear abajo deja al roadmap
   mintiendo para siempre. Es la trazabilidad lo que decide.
3. **Tercer nivel explícito.** Si el cambio contradice la iniciativa, ni regenerar la visión
   alcanza: se dice que ya no es el mismo proyecto.
4. **`scripts/reabrir.mjs` hace solo la transición**, y se corre **antes** de editar: versión +1,
   `IN_REVIEW`, limpia firmas, cascada `STALE`, emite `ARTIFACT_UPDATED` con `was_approved`. No
   edita el documento: eso es criterio. Después sigue el ciclo de siempre.
5. **El hash no se toca.** Sigue siendo el de la versión firmada. Como el chequeo 12 saltea lo que
   no está `APPROVED`, el aviso se apaga solo, y `approve.mjs` recalcula el hash al volver a firmar.
   Todo el problema de los seis avisos era que nadie movía el estado.
6. **El costo lo calcula `impact.mjs`, no el agente.** Y avisa además qué artefactos tienen
   `version > 1`, que es el proxy exacto de "acá hubo trabajo humano" y es lo que se pierde al
   regenerar.
7. **Re-firmar no pisa una entrega.** `approve.mjs` conserva `HANDED_OFF` y agrega
   `redelivery_pending`. Pisarlo a `APPROVED` borraba el único dato que dice que hay código
   construyéndose sobre esa feature, y con eso se caía la guarda de `handoff.mjs`.
8. **`rutaArtefacto` se movió a `lib/store.mjs`.** Estaba duplicada identica en `approve.mjs` y
   `restore.mjs`, y `reabrir.mjs` habría sido la tercera copia.

### Motivo

El problema real no era la falta de un comando: era que el camino correcto no existía como
transición y que el camino grande no estaba ofrecido. Una persona que quiere cambiar algo no sabe
qué artefacto tocar, y si el modelo le pide que lo sepa, edita el archivo a mano. Eso es lo que
pasó seis veces.

Se descartó explícitamente todo lo que no hacía falta para esto: el techo computable, las dos fases,
versionar el brief, `/sdd-resync` y el E2E entre repos. Son para el caso de una feature en
construcción del otro lado del borde, que es coordinación humana y no se resuelve con un comando.

### Artefactos modificados

`scripts/reabrir.mjs` (nuevo), `scripts/approve.mjs`, `scripts/impact.mjs`, `scripts/restore.mjs`,
`scripts/smoke.mjs`, `lib/store.mjs`, `.claude/commands/dsc-change.md`,
`.claude/commands/dsc-status.md`, `.claude/commands/dsc-impact.md`, `CLAUDE.md`.

### Impacto en la cadena

Ninguno sobre lo existente. El audit sigue en 0 errores y 14 avisos, y el smoke pasa 21 pasos con
tres nuevos: que reabrir devuelva a revisión y **apague** el aviso del chequeo 12, que re-firmar
conserve la entrega, y que `approve.mjs` se niegue sobre algo aprobado derivando a `reabrir`.

Los seis avisos del chequeo 12 en `proyecto-1` siguen ahí a propósito: son reales. Se apagan cuando
esas features se reabran y se vuelvan a firmar, o se restauren.
## DEC-011

**Fecha:** 2026-09-15
**Tipo:** Técnica
**Estado:** ACTIVE
**Responsable:** Kevin Belmonte (Proguide)
**Proyecto:** global
**command_origin:** agregado de saneamiento Unicode/ANSI (SEC-02/SEC-03, evidencia ISO 42001)

### Título

Saneamiento determinista de Unicode invisible y ANSI en `ideas/`

### Gap o motivo

El Paso 1 de `/dsc-refine` ya le pedía al agente detectar "texto invisible" como parte del check
de inyección de instrucciones — pero un carácter literalmente invisible en el contexto del LLM es,
por definición, el caso que un LLM tiene más chances de no ver. Ningún script lo verificaba: el
único mecanismo determinista existente (`scripts/discovery-audit.mjs`, chequeo de patrones de
secreto) audita artefactos ya escritos, no el contenido crudo de `ideas/` antes de leerse.

No es un gap nuevo del Discovery Model en particular: es el mismo caso que ya se resolvió del lado
`sdd-model` (equivalente SEC-02/SEC-03 allí, sobre `drafts/`). `ideas/` es exactamente el mismo tipo
de input no confiable — sale de mails, minutas y documentos de terceros (constitution.md, sección
Seguridad) — así que se porta la misma lógica en vez de reinventarla.

### Alternativas consideradas

1. Ampliar el texto del Paso 1 para que el agente preste más atención a caracteres invisibles.
2. Sumarlo como chequeo 18 de `scripts/discovery-audit.mjs`.
3. Un script nuevo (`lib/sanitize.mjs` + `scripts/sanitize.mjs`) que corre como paso previo al
   check de seguridad de `/dsc-refine`, sobre `ideas/` antes de que el agente la lea.

### Por qué se descartaron

La 1 no arregla nada verificable: le pide al LLM que "vea mejor" exactamente lo que por
construcción no ve — es la misma clase de solución que `constitution.md` ya rechaza para todo lo
determinista.

La 2 audita en el momento equivocado. `discovery-audit.mjs` corre sobre artefactos ya escritos
(`iniciativa.md`, `visión.md`, etc.), no sobre `ideas/` antes de que el agente la procese. Para
cuando el chequeo 18 corriera, el agente ya habría leído el contenido crudo.

### Decisión tomada

1. **`lib/sanitize.mjs`** — `sanearUnicode()`, `sanearAnsi()`, `sanear()`. Remueve bidi
   override/isolate, zero-width, variation selectors, tag characters y control C0/C1 (salvo
   `\t\n\r`); remueve secuencias de escape ANSI (CSI/OSC). Cero dependencias, igual que el resto
   del modelo. El orden importa y queda documentado en el propio módulo: ANSI corre antes que
   Unicode, porque una secuencia ANSI empieza con un byte de control (ESC/BEL) que el paso de
   Unicode también removería, dejando el resto de la secuencia como texto visible en vez de
   neutralizarla.
2. **`scripts/sanitize.mjs`** — CLI. `<slug> [--write] [--json]` sobre `proyectos/<slug>/ideas/`,
   `--path <ruta>` para una ruta explícita, o `-` para filtrar por stdin sin tocar disco.
3. **`/dsc-refine` corre `node scripts/sanitize.mjs <slug> --write` como Paso 1a**, antes del check
   de inyección/secretos existente. No lo reemplaza — ese sigue siendo juicio del agente, ahora
   sobre texto ya limpio.
4. **`constitution.md`** suma un MUST explícito junto al de input no confiable, así el saneamiento
   determinista queda como principio no negociable y no solo como detalle de implementación de un
   comando.

### Motivo

Determinismo sobre juicio del LLM para todo lo mecánicamente verificable es el pilar #7 del
modelo (`scripts/discovery-audit.mjs`, `CLAUDE.md` sección Determinismo). Un carácter invisible es
el caso de libro de texto de esa regla: pedirle al agente que lo note es exactamente la clase de
"confiar en que el LLM se dé cuenta" que el modelo evita en todo lo demás.

### Artefactos modificados

`lib/sanitize.mjs` (nuevo), `scripts/sanitize.mjs` (nuevo), `.claude/commands/dsc-refine.md`,
`constitution.md`.

### Impacto en la cadena

Ninguno sobre lo existente. `node scripts/discovery-audit.mjs` sigue en 17 chequeos, 0 errores, 0
avisos (repo sin proyectos reales committeados). `npm test` (`scripts/smoke.mjs`) sigue pasando
los dieciocho pasos sin cambios — el saneamiento no está enganchado a ningún chequeo determinista
todavía, es un paso previo de `/dsc-refine`, así que no hay caso nuevo que agregar al smoke sin
antes decidir si merece su propio chequeo en `discovery-audit.mjs` (quedó fuera de alcance de esta
decisión: ver "Alternativas consideradas", opción 2).

---

## DEC-012

**Fecha:** 2026-09-21
**Tipo:** Técnica
**Estado:** ACTIVE
**Responsable:** Kevin Belmonte
**Rol:** Proguide
**Proyecto:** global
**command_origin:** expansión de cobertura Unicode a lib/sanitize.mjs (continuación de DEC-011)

### Título

Expansión del saneamiento Unicode: cinco categorías invisibles nuevas

### Gap o motivo

`lib/sanitize.mjs` quedó incompleta en la primera pasada (DEC-011). La cobertura de Unicode invisible
removía bidi override/isolate, zero-width, variation selectors, tag characters y control C0/C1,
pero faltaban cinco categorías adicionales también invisibles y con capacidad de ocultar texto:

1. **Soft hyphen (SHY, U+00AD)** — inserción manual de guiones suaves en palabras
2. **Rellenos Hangul (U+115F, U+1160, U+3164, U+FFA0)** — caracteres de espaciado silencioso en texto coreano
3. **Marcas direccionales (LRM/RLM/ALM: U+200E, U+200F, U+061C)** — controles de dirección de lectura
4. **Combining grapheme joiner (CGJ, U+034F)** — modificador de renderización de caracteres
5. **Braille blank (U+2800)** — punto braille vacío, literalmente un espacio que no se ve como tal

Ninguna estaba en el regex de `sanearUnicode()` de DEC-011, aunque todas coinciden con la
amenaza que esa decisión identificó: caracteres que un LLM tiene altas chances de no detectar
visualmente cuando lee el contenido bruto.

### Alternativas consideradas

1. Ninguna evaluada.

### Por qué se descartaron

No hay una forma alternativa razonable de cubrirlas. O se agregan al regex de `sanearUnicode()`,
o quedan sin sanear. Dejarlas sin sanear reabre el riesgo que motivó DEC-011: son exactamente la
clase de caracteres invisibles que el modelo buscó eliminar, solo que se quedaron fuera en la
primera pasada.

### Decisión tomada

Se agregaron cinco categorías nuevas al array `CATEGORIAS` en `lib/sanitize.mjs`:

- 'marca direccional (LRM/RLM/ALM)' → captura U+200E, U+200F, U+061C
- 'soft hyphen' → captura U+00AD
- 'combining grapheme joiner' → captura U+034F
- 'relleno hangul' → captura U+115F, U+1160, U+3164, U+FFA0
- 'braille blank' → captura U+2800

El regex de `sanearUnicode()` se expandió sin cambiar el orden de los pasos ni la estructura del
resto del saneamiento. Verificado con:

- `npm test`: 19/19 pasos del smoke completo, todos verdes
- Prueba manual: se pasó cada una de las cinco categorías nuevas por `lib/sanitize.mjs`,
  verificado que detectan correctamente y que `sanear()` las remueve sin dejar residuos

### Motivo

Completar la cobertura de Unicode invisible iniciada en DEC-011. El riesgo de que un LLM no
detecte estos caracteres es el mismo. DEC-011 dejó la puerta abierta expresamente —en su sección
"Impacto en la cadena" menciona: "no hay caso nuevo que agregar al smoke sin antes decidir si
merece su propio chequeo en `discovery-audit.mjs`" — y esto no agrega un chequeo sino que amplía
la lógica existente que funcionó en los dieciocho pasos.

### Artefactos modificados

`lib/sanitize.mjs` — expansión del array `CATEGORIAS` (5 nuevas) y del regex de `sanearUnicode()`
(5 patrones nuevos).

### Impacto en la cadena

Ninguno. Es un cambio de herramienta interna (`lib/sanitize.mjs`), no toca specs/ ni proyectos/.
No hace falta correr `/dsc-impact` ni invalidar artefactos de negocio. El smoke test sigue pasando
en su totalidad (19/19) sin casos nuevos que agregar.
