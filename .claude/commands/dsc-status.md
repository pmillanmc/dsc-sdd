---
description: Muestra en qué etapa está cada proyecto, qué lo bloquea y cuál es el próximo comando.
---

# /dsc-status

El comando al que se vuelve siempre. Tiene que responder cuatro cosas: **dónde estamos, qué falta,
quién tiene la pelota, y qué comando corro ahora.**

## Paso 1 — Leer

- `registry/proyectos.yaml` — los proyectos
- `proyectos/<slug>/metrics/workflow-status.json` — el estado de cada uno
- `config/workflow.yaml` — las etapas y su orden

Si el usuario nombró un proyecto, mostrá solo ese. Si hay uno solo, mostrá ese. Si hay varios y no
nombró ninguno, mostrá el resumen de todos y ofrecé profundizar.

**Si `workflow-status.json` no existe**, no es un error: la etapa es `iniciativa` y todo lo demás
`PENDING`. Informalo y seguí.

## Paso 2 — Detectar problemas

Antes de reportar, verificá cuatro cosas:

**Desincronización.** Si el campo `updated` del estado es más nuevo que la fecha de modificación
del archivo en disco, la carpeta sincronizada puede estar desactualizada:

```
La carpeta puede estar desincronizada: el estado dice que se actualizó
[fecha] pero el archivo local es más viejo. Esperá a que termine de
sincronizar antes de hacer cambios.
```

**Artefactos tomados.** Si algún artefacto tiene `claimed_by`, reportalo con nombre y desde cuándo.
Si pasaron más de 24 horas, marcalo como probablemente abandonado. **Avisa, no impide.**

**Artefactos `STALE`.** Si alguno quedó obsoleto porque cambió un antecesor, decilo con la causa:
`roadmap está STALE porque vision pasó a v2`.

**Bloqueos por dependencia.** Leé la salida del chequeo 16 en `metrics/audit-result.json` — no la
recalcules. Si hay dependencias entre épicas que cruzan de trimestre o apuntan a algo inexistente,
reportalas: son la causa más común de que algo esté esperando sin que se vea por qué.

```
EP004 no puede terminar hasta que salga EP003, que está en Q2.
```

**Artefactos cambiados después de firmarse.** Leé el chequeo 12 del mismo archivo, tampoco lo
recalcules. Marca artefactos que figuran `APPROVED` pero cuyo contenido ya no coincide con lo que
alguien firmó: se editaron sin pasar por `/dsc-change`.

Es el aviso más fácil de no ver del modelo y el que más caro sale. Reportalo siempre, con la
consecuencia concreta:

```
F003 a F008 cambiaron después de firmarse. Figuran aprobadas, pero lo que
dicen hoy no es lo que firmó nadie.

Las 8 están entregadas a desarrollo, así que su reenvío está bloqueado
hasta volver a revisarlas y firmarlas.

Para cada una: /dsc-review, después /dsc-approve.
Si el cambio no era deseado: /dsc-restore.
```

Si además la feature está `HANDED_OFF` o tiene `redelivery_pending`, decilo: hay gente construyendo
sobre esa spec y el modelo no puede avisarles.

## Paso 3 — Reportar

Formato, en lenguaje de negocio:

```
<Nombre del proyecto>  ·  <PRY-nnn>

  Iniciativa   ✅ aprobada          v1   12-ago → 12-ago   (mismo día)
  Visión       ✅ aprobada          v2   12-ago → 12-ago   (mismo día)
  Roadmap      ⚠️  obsoleta          la visión cambió a v2
  Release      🔵 en curso                arrancó 26-ago   (hace 2 días)
  Features     ⬜ pendiente

  Progreso     2 de 7 etapas aprobadas

  Bloqueo      El roadmap quedó obsoleto y hay que regenerarlo

  Próximo paso Regenerar el roadmap sobre la visión v2
               /dsc-roadmap
```

Íconos: ✅ aprobado · 🔵 en curso o en revisión · ⏳ esperando firma · ⚠️ obsoleto o con cambios
pedidos · ❌ rechazado o fallado · ⬜ pendiente.

Cuando una etapa espera firmas, decí **qué roles faltan**, no solo que espera.

**Fechas.** Salen del estado, no de `events.jsonl`: `started_at` y `approved_at` de cada etapa.

- Etapa aprobada → `inicio → aprobación`, más cuánto llevó. Si arrancó y se aprobó el mismo día,
  escribí `(mismo día)`: es más honesto que `0 días`.
- Etapa en curso, en revisión o esperando firma → `arrancó <fecha>` y **hace cuánto**. Es el dato
  que dispara la conversación: una etapa en revisión hace nueve días es un problema, y no se ve
  mirando solo el estado.
- Etapa sin `started_at` → no muestres nada. Son etapas aprobadas antes de que el modelo guardara
  la fecha. **No inventes una** y no lo reportes como problema.

Fechas en formato corto y en español (`12-ago`). La hora no aporta: la pregunta es de días.

## Paso 4 — Regenerar el dashboard

```bash
node scripts/gen-dashboard.mjs
```

Cerrá con: `Dashboard actualizado: abrí dashboard/index.html con doble clic.`

Si node no está disponible, avisá que el dashboard no se pudo regenerar y que el reporte que
acabás de dar es la información al día.

## Paso 5 — El próximo comando

**Siempre terminá con el comando literal a ejecutar.** Es la regla que hace que un PM no tenga que
recordar 24 comandos. Si hay más de una opción razonable, dá la recomendada primero.

## Reglas

- No modifiques ningún artefacto ni el estado. `/dsc-status` solo lee.
- No inventes progreso: si falta información, decí que falta.
- Si un proyecto no arrancó, no lo presentes como un problema — decí cómo empezar.
