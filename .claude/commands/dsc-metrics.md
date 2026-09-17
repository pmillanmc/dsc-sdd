---
description: Calcula las métricas del proyecto sobre el historial de eventos y las deja listas para el tablero.
---

# /dsc-metrics

Único proyector de `project-metrics.json`. El tablero lo consume; nadie más lo escribe.

## Paso 0 — Resolver el alcance

Los scripts, sin `<slug>`, corren sobre **todos** los proyectos. Eso es correcto para ellos —el
tablero necesita las métricas de todos frescas— pero no es lo que quiere alguien que pregunta por
su proyecto. Así que el alcance lo resuelve este comando, y le pasa el slug explícito.

Es **la misma convención que `/dsc-status`**, no una nueva:

| Situación | Alcance |
|---|---|
| El usuario nombró un proyecto | ese |
| Hay uno solo registrado | ese |
| El usuario dijo `all` (o "todos") | todos: se corren los scripts **sin** slug |
| Hay varios y no nombró ninguno | **preguntá antes de calcular** |

El último caso importa: con doce proyectos, calcular todo por defecto es lento y casi siempre no
era lo que se pedía.

```
Hay 4 proyectos registrados. ¿De cuál querés las métricas?

  gestion-identidades · portal-clientes · stock · turnos

Si querés las de todos, decime "todos".
```

**El mismo slug va a los dos pasos.** Filtrar el audit por un proyecto y calcular las métricas de
todos —o al revés— produce un índice de calidad que no corresponde a los hallazgos que se leyeron.

No inventes un "proyecto actual": el modelo no tiene sesión ni marcador de proyecto activo, y
agregarlo sería una cuarta fuente de verdad sobre en qué proyecto estás.

## Paso 1 — Audit primero

```bash
node scripts/discovery-audit.mjs <slug>
```

Las métricas de calidad y bloqueos se apoyan en los hallazgos del audit. Sin correrlo antes,
el índice de calidad sale sin esa componente y hay que decirlo.

## Paso 2 — Calcular

```bash
node scripts/gen-metrics.mjs <slug>
```

## Paso 3 — Presentar

Traducí a lenguaje de negocio. Lo importante no son los números sino qué significan.

```
Gestión de Stock — 3 de 7 etapas aprobadas (43%)

  Calidad          92 / 100
  Bloqueos         2
  Tiempo de ciclo  1,2 días promedio por artefacto
  Retrabajo        14% — de cada 7 artefactos generados, 1 volvió con
                   observaciones bloqueantes

  Todavía sin datos: eficiencia de flujo. Se calcula cuando haya al menos
  dos etapas cerradas de punta a punta.

Qué está frenando:
  · El release espera la firma del Product Owner
  · F001 tiene observaciones bloqueantes sin resolver
```

## La regla que no se rompe

**Si faltan eventos para una métrica, se dice "sin datos suficientes".**

Nunca la estimes, nunca la infieras de fechas de archivo, nunca pongas cero. Una métrica
inventada es peor que una ausente: alguien va a tomar una decisión sobre ella.

Cuando una métrica no está disponible, explicá **qué falta para que aparezca** — no dejes al
usuario pensando que el modelo está roto.

## Los semáforos

Los colores salen de `config/governance.yaml`, no están hardcodeados. Si el equipo cambia el
umbral de retrabajo aceptable, cambia el color sin tocar código.

Si el usuario pregunta por qué algo está en rojo, mostrale el umbral configurado.

## Cierre

Regenerá el tablero y avisá:

```bash
node scripts/gen-dashboard.mjs
```

## Métricas desactualizadas

Si el tablero marca un proyecto como desactualizado, es porque su estado se movió después del
último cálculo: los números que muestra son viejos. Lo detecta comparando el `updated` del estado
contra el `generated` de `project-metrics.json`, y se arregla recalculando ese proyecto.

Cuando alguien corre `/dsc-metrics` de un solo proyecto, **los demás quedan sin recalcular**. Eso
está bien y es la razón por la que existe la marca: el tablero avisa en vez de mentir.

## Reglas

- No modifiques ningún artefacto.
- El alcance lo resuelve el paso 0 y se pasa explícito. Nunca corras los scripts sin slug
  asumiendo que "total, es un proyecto solo": verificá que lo sea.
- No le pidas información al usuario: todo sale de los eventos y los artefactos.
- No generes HTML: eso es de `gen-dashboard.mjs`.
- `project-metrics.json` es contrato estable. Se puede extender, no romper: es el punto de
  integración si mañana quieren llevarlo a Power BI o Grafana.
