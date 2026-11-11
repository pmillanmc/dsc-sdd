# Configuración de Anthropic (Claude Code) e integración en el proceso de desarrollo

| | |
|---|---|
| **Versión** | 1.1 |
| **Fecha** | 2026-11-11 (v1.0: 2026-10-06) |
| **Objeto** | Configuración aplicada al asistente de Anthropic (Claude Code) utilizado en el proceso de desarrollo |
| **Responsable** | Patricio Millán |
| **Origen** | Oportunidad de mejora: documentar las configuraciones aplicadas a Anthropic y su integración en el proceso de desarrollo |
| **Revisión** | Ante cualquier cambio en los archivos listados en el punto 2 |

---

## 1. Propósito y alcance

Documentar **qué configuración tiene aplicada la herramienta de Anthropic (Claude Code)** en los
entornos de desarrollo de la organización: qué parámetros se fijaron, qué puede y qué no puede
hacer el asistente, qué información le llega y sale, de qué depende y qué controles lo acotan.

**Alcance:** la configuración del producto. Este documento no describe la metodología de trabajo
sobre la que se lo usa, salvo cuando esa metodología es, en sí misma, un parámetro de
configuración del asistente (el archivo de instrucciones de proyecto, punto 3.6).

**Fuera de alcance:** la configuración de la cuenta corporativa de Anthropic (plan, workspaces,
retención de datos, altas y bajas de usuarios), que no se resuelve en el entorno de desarrollo.
Se lista como puntos abiertos en el punto 9.

---

## 2. Dónde vive la configuración

Claude Code se configura por archivos, en tres niveles que se superponen. Saber cuál es cuál es
lo que permite auditarlo:

| Nivel | Archivo | Versionado | Qué fija |
|---|---|---|---|
| Usuario (la máquina) | `~/.claude/settings.json` | No | Modelo, nivel de esfuerzo, permisos personales |
| Proyecto (compartido) | `<repo>/.claude/settings.json` | **Sí** | Permisos de ejecución y hooks que valen para todo el equipo |
| Proyecto (local) | `<repo>/.claude/settings.local.json` | No, excluido por `.gitignore` | Permisos propios de esa máquina |

Dentro del repositorio, los componentes de configuración son:

| Componente | Ruta | Qué define |
|---|---|---|
| Permisos y hooks | `.claude/settings.json` | Qué puede ejecutar el asistente y qué corre al abrir sesión |
| Permisos locales | `.claude/settings.local.json` | Excepciones de esa máquina |
| Instrucciones de proyecto | `CLAUDE.md` | Reglas de comportamiento que el asistente carga siempre |
| Comandos | `.claude/commands/*.md` | Instrucciones empaquetadas que el usuario invoca con `/` |
| Subagentes | `.claude/agents/*.md` | Modelo y herramientas habilitadas por tarea delegada |
| Skill | `.claude/skills/` | Reglas que se cargan solo cuando aplican |
| Hook | `.claude/hooks/dsc-session-capture.mjs` | Código que corre al iniciar una sesión |
| Servidores MCP | *(no existe `.mcp.json`)* | Ninguna integración MCP habilitada |

La regla operativa es que **todo lo que amplía lo que el asistente puede hacer está versionado y
es revisable**, y lo que es propio de una máquina queda fuera del repositorio.

---

## 3. Parámetros de configuración aplicados

### 3.1 Modelo y nivel de esfuerzo

Fijados a nivel usuario, en `~/.claude/settings.json`:

| Parámetro | Valor | Efecto |
|---|---|---|
| `model` | `claude-opus-5` | Modelo por defecto de la sesión principal |
| `effortLevel` | `high` | Nivel de razonamiento aplicado antes de responder |
| `modelSettings` | `claude-opus-5` con `effortLevel: high` | Mismo nivel al seleccionar ese modelo explícitamente |

El modelo de la sesión principal **no se fija en el repositorio**: es una preferencia de cada
usuario. Los modelos de las tareas delegadas, en cambio, sí están fijados (punto 3.4).

### 3.2 Permisos de ejecución

El asistente **no tiene permiso general para ejecutar comandos**. Se declaró una allowlist
cerrada en `.claude/settings.json`, comando por comando:

```
Bash(node --version)
Bash(node scripts/check-env.mjs)
Bash(node scripts/gen-dashboard.mjs)
Bash(node scripts/new-proyecto.mjs:*)
Bash(node scripts/gen-roadmap.mjs:*)
Bash(node scripts/approve.mjs:*)
Bash(node scripts/impact.mjs:*)
Bash(node scripts/restore.mjs:*)
Bash(node scripts/discovery-audit.mjs)      + variante con argumentos
Bash(node scripts/gen-metrics.mjs)          + variante con argumentos
Bash(node scripts/estimate.mjs:*)
Bash(node scripts/split.mjs:*)
Bash(node scripts/handoff.mjs:*)
Bash(node scripts/smoke.mjs)
```

Características del esquema:

- **Sin comodines de ruta.** Solo scripts propios del repositorio, nombrados uno por uno. El
  sufijo `:*` admite argumentos del script ya autorizado; no admite otro ejecutable ni otra ruta.
- **Todo lo demás requiere aprobación explícita del usuario** en el momento en que se pide.
- A nivel usuario hay además una lista de permisos personales, acumulada por uso, y la regla
  `ask` sobre `Task` y `Agent`: **delegar trabajo a un subagente pide confirmación**.

### 3.3 Hooks

Único punto donde se ejecuta código automáticamente, sin que el usuario lo pida. Hay uno solo,
declarado en `.claude/settings.json` sobre el evento `SessionStart`, que ejecuta
`.claude/hooks/dsc-session-capture.mjs`.

Por correr sin intervención, se mantuvo mínimo y auditable de un vistazo (24 líneas):

- **sin acceso a red**;
- **sin dependencias externas**;
- **sin escritura fuera de `metrics/`**;
- registra únicamente fecha y carpeta de trabajo. **No registra contenido de prompts ni de
  archivos**;
- falla en silencio: nunca impide abrir una sesión.

### 3.4 Subagentes: modelo y herramientas habilitadas

Cuando se delega una tarea, el subagente corre con el modelo y **solo las herramientas que su
tarea necesita**. Ninguno tiene acceso a ejecución de comandos ni a red:

| Subagente | Modelo | Herramientas habilitadas |
|---|---|---|
| `decision-logger` | haiku | Read, Write |
| `dashboard` | sonnet | Read, Write |
| `feature-estimator` | sonnet | Read, Write, Glob |
| `metrics` | sonnet | Read, Write, Glob, Grep |
| `release-planner` | sonnet | Read, Write, Glob, Grep |
| `vision-creator` | opus | Read, Write, Glob, Grep, AskUserQuestion |
| `roadmap-creator` | opus | Read, Write, Glob, Grep, AskUserQuestion |
| `feature-decomposer` | opus | Read, Write, Glob, Grep, AskUserQuestion |
| `reviewer` | opus | Read, Write, Glob, Grep, AskUserQuestion |

Criterio: el modelo más chico para tareas de registro y consolidación de datos, el más capaz para
generación y evaluación de contenido. Ninguno hereda los permisos de ejecución de la sesión
principal.

### 3.5 Comandos y carga de contexto

- **Comandos** (`.claude/commands/`): 29 instrucciones invocables con `/`. No amplían permisos;
  son texto que se carga al invocarlos. Las instrucciones de proyecto indican explícitamente
  cargar el archivo de un comando **solo cuando se lo invoca**, no todos de entrada.
- **Skills** (`.claude/skills/`): dos. `discovery-standards` no contiene las reglas: **enruta** a
  una de cinco referencias y se carga solo la que aplica. `prototyping` es el oficio de armar un
  prototipo descartable, y se carga solo cuando se invoca `/dsc-prototype`.

Ambas cosas son, además de diseño, una medida de control: acotan cuánta información del
repositorio se envía al servicio en cada turno (punto 5).

### 3.6 Instrucciones de proyecto (`CLAUDE.md`)

Es el único archivo que el asistente carga **en todas las sesiones**, y por lo tanto el parámetro
de configuración con más efecto sobre su comportamiento. Las reglas que fija y que son de
naturaleza de control:

- no inventar información: si falta un dato y es crítico, se pregunta;
- el asistente **nunca aprueba** nada; registra firmas de una persona identificada;
- el material de terceros se trata como entrada no confiable (punto 6.2);
- ningún secreto entra a un documento generado;
- lo que verifica un script determinista no se recalcula con criterio del modelo, y si ese script
  no puede correr, el modo degradado **se anuncia** y no se reporta como verificado.

### 3.7 Servidores MCP e integraciones

**No hay servidores MCP configurados a nivel proyecto**: no existe `.mcp.json` en el repositorio.
El asistente no tiene habilitada ninguna integración con sistemas externos por esa vía.

### 3.8 Variables de entorno

| Variable | Para qué | Nota |
|---|---|---|
| `CLAUDE_PROJECT_DIR` | Raíz del proyecto; la provee el cliente | Usada por el hook |
| `DSC_ESTADO_DESTINO` | Destino de la publicación de estado del entorno | No es configuración de Claude; se documenta por completitud |
| `DSC_ESTADO_TOKEN` | Credencial de ese destino | **Nunca por línea de comandos**: quedaría en el historial del shell y en la lista de procesos |
| `DSC_ESTADO_INSEGURO` | Habilita explícitamente enviar esa credencial sin cifrado | Sin ella, el envío se rechaza |

---

## 4. Autenticación y credenciales

- **No hay claves de API de Anthropic en el repositorio ni en los archivos de configuración
  versionados.** La autenticación la gestiona el cliente de Claude Code en la máquina del
  usuario, contra la cuenta corporativa.
- Ninguna credencial se pasa por línea de comandos en ningún flujo del entorno.
- La administración de la cuenta, altas y bajas, queda fuera de este documento (punto 9).

---

## 5. Flujo de información hacia Anthropic

Es la interfaz que determina qué información de la organización sale de la máquina. En una sesión
de trabajo se envían al servicio:

- los mensajes del usuario;
- el archivo de instrucciones de proyecto, y los comandos y referencias que se carguen en ese
  turno;
- **el contenido de los archivos que el asistente lee o escribe durante la tarea**, incluidos los
  documentos de entrada que el equipo coloca en el repositorio y los documentos que se generan a
  partir de ellos;
- la salida de los comandos que se ejecutan con permiso.

Lo que **no** sale: nada hacia terceros **por iniciativa del asistente**. No hay servidores MCP
(3.7) y el hook de sesión no tiene acceso a red (3.3). Toda escritura fuera del repositorio
requiere confirmación explícita.

### 5.1 La única salida configurable: publicación de estado

El modelo tiene **una** vía de salida hacia un sistema de la organización, y conviene que esté
declarada porque es la excepción a lo anterior. No la inicia el asistente: la ejecuta una persona
corriendo un comando.

| | |
|---|---|
| Qué la dispara | `scripts/publicar.mjs`, invocado por una persona. Nunca automática, nunca en segundo plano |
| A dónde | `--destino` o `DSC_ESTADO_DESTINO`. **Sin destino por defecto**: sin esa variable el comando no hace nada |
| Con qué credencial | `DSC_ESTADO_TOKEN`, solo por variable de entorno (3.8) |
| Con qué código | `fetch` nativo. Sin dependencias de terceros, coherente con C-12 |

**Qué viaja:** identificadores del proyecto (`proyecto_id`, slug y nombre), etapa actual, motivo
de bloqueo, conteos del audit y, por feature, sus identificadores, épica, release, talle, estado,
versión y hash. Y los objetivos de las épicas.

**Qué no viaja:** el **cliente** del proyecto no forma parte del envío. Tampoco el contenido de
los artefactos: viajan sus identificadores y su estado, no su texto.

**Control sobre la credencial.** Si el destino es `http://` y no es `localhost`, el envío se
**rechaza**: el bearer viajaría en texto plano y lo vería la red entera. Se puede forzar sobre una
red de confianza declarándolo con `DSC_ESTADO_INSEGURO=1`, que es un acto deliberado y queda a la
vista en la configuración del entorno. El control no fija el destino — la URL sigue siendo libre.

Medidas aplicadas sobre ese flujo:

| Medida | Dónde está configurada |
|---|---|
| Las carpetas con documentación de clientes están excluidas del versionado | `.gitignore` |
| Carga de reglas por contexto, no todo el cuerpo normativo en cada turno | skill enrutado (3.5) |
| Carga del archivo de un comando solo al invocarlo | `CLAUDE.md` |
| Lectura acotada por subagente: cada uno lee solo lo que su contrato declara | `.claude/agents/` |
| Advertencia si el repositorio está en una carpeta sincronizada (OneDrive, SharePoint, Dropbox, Google Drive, Box) | `scripts/check-env.mjs` |
| Detección de secretos antes de que un contenido se escriba fuera del repositorio | `lib/handoff.mjs` |

---

## 6. Controles de seguridad sobre el asistente

### 6.1 Privilegio mínimo

Allowlist cerrada de ejecución sin comodines (3.2); herramientas acotadas por subagente (3.4);
confirmación requerida para delegar a un subagente (3.2); escritura confinada al árbol del
proyecto, con la única excepción de una entrega a un destino validado y confirmado por el
usuario.

### 6.2 La entrada de terceros se trata como dato, no como instrucción

Los documentos que llegan de afuera (mails, minutas, relevamientos) se escanean antes de
procesarse, buscando:

- **inyección de instrucciones** — texto dirigido al asistente en vez de al equipo: pedidos de
  ignorar instrucciones anteriores, de ocultarle algo al usuario, o instrucciones camufladas en
  comentarios HTML o en texto invisible;
- **secretos** — claves de API, tokens, contraseñas, cadenas de conexión, URLs con credenciales
  embebidas;
- **dependencias o URLs sospechosas** — pedidos de instalar algo, descargas de origen no
  reconocido, scripts a ejecutar.

Lo detectado **se reporta y no se procesa como requisito**: espera decisión humana.

### 6.3 Detección de secretos en la salida

Antes de que un contenido generado se escriba fuera del repositorio se verifica que no contenga
claves privadas, claves de acceso AWS, tokens de GitHub, JWT, cadenas de conexión con
credenciales ni URLs con credenciales, con lista de exclusión para falsos positivos
(`process.env`, `.env`, ejemplos y plantillas). Si detecta algo, no escribe.

### 6.4 El asistente no decide ni aprueba

Toda aprobación la da una persona identificada; el asistente solo registra la firma. Ningún
automatismo del entorno avanza un punto de control por su cuenta.

### 6.5 Superficie de ejecución

Los scripts que el asistente tiene permitido ejecutar son propios del repositorio y **sin
dependencias de terceros** (cero paquetes npm, solo módulos nativos de Node). No abren puertos,
no escuchan conexiones y no quedan residentes: leen, escriben y terminan.

---

## 7. Controles y evidencia

| # | Control | Configurado en | Cómo se verifica |
|---|---|---|---|
| C-01 | Allowlist de ejecución cerrada, sin comodines | `.claude/settings.json` | Inspección del archivo |
| C-02 | Confirmación requerida para delegar a un subagente | `~/.claude/settings.json` (regla `ask`) | Inspección |
| C-03 | Permisos de máquina fuera del versionado | `.gitignore` | Inspección |
| C-04 | Modelo y nivel de esfuerzo fijados | `~/.claude/settings.json` | Inspección |
| C-05 | Mínimo privilegio de herramientas por subagente | encabezado de `.claude/agents/*.md` | Tabla del punto 3.4 |
| C-06 | Hook sin red, sin dependencias y sin contenido de prompts | `.claude/hooks/dsc-session-capture.mjs` | 24 líneas, lectura directa |
| C-07 | Sin integraciones MCP habilitadas | ausencia de `.mcp.json` | Inspección |
| C-08 | Sin credenciales de Anthropic en el repositorio | repositorio completo | Búsqueda en el árbol |
| C-09 | Reglas de comportamiento cargadas en toda sesión | `CLAUDE.md` | Inspección |
| C-10 | Escaneo de inyección y secretos sobre la entrada de terceros | `.claude/commands/dsc-refine.md` | Reporte en pantalla al procesar |
| C-11 | Detección de secretos antes de escribir fuera del repositorio | `lib/handoff.mjs` | `npm test` |
| C-12 | Cero dependencias de terceros en lo que se ejecuta | `package.json` sin dependencias; sin `node_modules` | Inspección |
| C-13 | Advertencia si el repositorio está en carpeta sincronizada | `scripts/check-env.mjs` | `npm run check` |
| C-14 | Prueba automatizada que valida los controles técnicos | `scripts/smoke.mjs` | `npm test` |
| C-15 | La publicación de estado no tiene destino por defecto: sin `DSC_ESTADO_DESTINO` no envía nada | `scripts/publicar.mjs` | Inspección; correrlo sin la variable |
| C-16 | La credencial de publicación no se acepta por línea de comandos | `scripts/publicar.mjs` | Inspección |
| C-17 | Se rechaza enviar la credencial en texto plano fuera de `localhost`, salvo declaración explícita | `lib/transporte.mjs` (`riesgoDeTextoPlano`) | Inspección; `DSC_ESTADO_INSEGURO` ausente |
| C-18 | El cliente del proyecto no forma parte de lo que se publica | `lib/publicable.mjs` | Búsqueda de `cliente` en el módulo |

---

## 8. Trazabilidad

| Qué se quiere poder reconstruir | Cómo |
|---|---|
| Qué configuración tenía el asistente en un momento dado | `.claude/settings.json`, `.claude/agents/`, `.claude/commands/`, `.claude/hooks/` y `CLAUDE.md` están versionados en git: todo cambio queda con autor y fecha |
| Qué permisos agregó una persona en su máquina | `.claude/settings.local.json` y `~/.claude/settings.json`, no versionados: se revisan en la máquina |
| Cuándo se usó la herramienta | `metrics/sessions.jsonl`, escrito por el hook de sesión |
| Por qué se tomó una decisión que se aparta de lo establecido | `DECISIONS.md` |
| Qué produjo el asistente y sobre qué base | Los documentos generados llevan encabezado de trazabilidad hacia su documento de origen |

---

## 9. Puntos abiertos (configuración de cuenta)

No se resuelven en el entorno de desarrollo y **no deben inferirse**. Pendientes de completar por
el responsable de la cuenta de Anthropic:

1. Plan contratado y tipo de cuenta (Claude Code, API o Enterprise), y quién la administra.
2. Política de retención y uso de datos acordada con Anthropic para el tráfico de estas sesiones.
3. Usuarios habilitados, procedimiento de alta y baja, y revisión periódica de accesos.
4. Clasificación de la información que se permite procesar con la herramienta, según la política
   interna de manejo de datos de clientes.
5. Aprobación formal de esta configuración y periodicidad de su revisión.

---

## 10. Mantenimiento

Este documento se actualiza ante cualquier cambio en los archivos del punto 2: permisos, hooks,
subagentes, instrucciones de proyecto o integraciones. El disparador natural es la revisión de
cambios sobre la carpeta `.claude/`, que está versionada.

**Ese disparador no alcanza, y la v1.0 lo demostró.** La publicación de estado (5.1) vive en
`lib/` y `scripts/`, no en `.claude/`: existía desde el 21-09, quince días antes de la v1.0, y
aun así el punto 5 afirmaba que no había integraciones salientes. Mirar solo `.claude/` deja
afuera justamente lo que determina qué información sale de la máquina.

Se revisa también ante cambios en: `lib/transporte.mjs`, `lib/publicable.mjs`,
`scripts/publicar.mjs` (qué sale y hacia dónde) y `lib/handoff.mjs` (qué cruza a desarrollo).

### Cambios de la v1.1

- Punto 5: se corrige la afirmación de que no había integraciones salientes, y se declara la
  publicación de estado en el nuevo 5.1 — qué la dispara, a dónde, con qué credencial, qué viaja
  y qué no.
- Controles C-15 a C-18, sobre esa misma vía de salida.
- Punto 3.5: 29 comandos (era 28) y dos skills (era uno), por `/dsc-prototype`.
- C-06: el hook tiene 24 líneas, no 25.
- Punto 10: se amplía el disparador de revisión más allá de `.claude/`.
