---
description: Verifica la consistencia del modelo con 15 checks deterministas y reporta qué hay que arreglar.
---

# /dsc-audit

Corre las verificaciones mecánicas. **Lo que este comando verifica, ningún otro lo recalcula**:
los demás leen `audit-result.json`.

## Paso 1 — Correr

```bash
node scripts/discovery-audit.mjs [<slug>]
```

Sin proyecto, audita todos.

## Paso 1b — Fechas y links de los documentos de entrada
```bash
node scripts/check-dates-links.mjs <slug>
```
Uno por cada proyecto auditado. Revisa todos los documentos de `ideas/`. No escribe nada, no
visita links y no forma parte de `audit-result.json`.
Si la iniciativa ya está escrita, no repitas hallazgos que ya quedaron resueltos en ella
(por ejemplo, un plazo que la iniciativa ya fija): mostrá solo lo que todavía no tiene respuesta.

Al traducir (paso 3), mostralo en una sección aparte, **DOCUMENTOS DE ENTRADA**, después de
bloqueantes y avisos. Nunca es bloqueante. Por cada `AVISO`, la persona decide:
- si cambia algo ya aprobado (por ejemplo un plazo de la iniciativa) → `/dsc-change`
- si no → se registra la decisión con `/dsc-log`

Sin Node, este paso no se hace a mano: se informa como no verificado.
Si no hay hallazgos, no muestres la sección.

## Paso 2 — Si node no está disponible

El comando falla con "node no se reconoce". Entrás en **modo degradado** y hay que anunciarlo:

```
⚠️  MODO DEGRADADO — sin Node no puedo correr la verificación automática.

Voy a revisar con criterio propio los checks que se pueden leer:
registro contra archivos, IDs huérfanos, integridad de la cadena,
placeholders y secretos.

Los otros diez necesitan cálculo (hashes, ciclos de dependencia, fechas
de aprobación) y no los voy a poder verificar. El resultado NO es
determinista: es una opinión, no una verificación.
```

Hacé esos cinco a mano, y marcá el reporte como no determinista. **Nunca reportes como
verificado algo que corriste en modo degradado.**

## Paso 3 — Traducir

No pegues la salida cruda. Agrupá por qué hay que hacer, en lenguaje de negocio.

Cada hallazgo trae un `hint` que dice cómo resolverlo: usalo.

```
El modelo tiene 3 problemas que impiden avanzar y 1 aviso.

BLOQUEANTES

  F002 no puede entregarse
    Salió talle XL en la estimación. Una feature de ese tamaño es
    retrabajo garantizado en desarrollo.
    → Dividila con /dsc-split

  El roadmap menciona una capacidad que no está en la visión (BC99)
    El roadmap no puede inventar capacidades: o se agrega a la visión
    o se saca del roadmap.
    → /dsc-vision para agregarla, o /dsc-roadmap para sacarla

AVISO

  Alguien editó la visión después de aprobarla
    El contenido ya no coincide con lo que firmó Ana Gómez.
    → /dsc-review para volver a aprobarla, o /dsc-restore para volver
      a la versión firmada
```

## Los 15 checks

| # | Verifica | Severidad |
|---|---|---|
| 1 | Registro contra archivos, en ambas direcciones | ERROR |
| 2 | IDs huérfanos: épica, release o capacidad faltante | ERROR |
| 3 | Integridad de la cadena: nada inventado aguas abajo | ERROR |
| 4 | Dependencias: ciclos, referencias rotas, orden violado | ERROR |
| 5 | Features aprobadas sin estimar, o XL sin dividir | ERROR |
| 6 | Aprobado sin todas las firmas requeridas | ERROR |
| 7 | Handoff sin `feature_id`, `target_repo` o dominio | ERROR |
| 8 | Placeholders en artefactos aprobados | ERROR |
| 9 | Cascada: aprobado antes que su antecesor | ERROR |
| 10 | IDs duplicados o fuera del contador | ERROR |
| 11 | Artefactos por encima del límite de tamaño | WARN |
| 12 | Editado a mano después de aprobado | WARN |
| 13 | Dos personas trabajando a la vez, o claim abandonado | WARN |
| 14 | Releases vencidos con features abiertas | WARN |
| 15 | Secretos en artefactos | ERROR |

Los checks 6, 9 y 12 detectan lo mismo por caminos distintos: **que alguien editó el estado o un
artefacto a mano**. Sin control de versiones, son la única defensa.

## Reglas

- **El comando no arregla nada.** Reporta. Arreglar es decisión humana.
- Los avisos no bloquean: un modelo con avisos sigue siendo usable.
- Si un check no dispara, no lo menciones. Nadie necesita leer diez "todo bien".
