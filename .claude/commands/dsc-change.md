---
description: Punto de entrada para cambiar algo ya generado. Decide si conviene ajustar o regenerar, y lo ejecuta.
---

# /dsc-change

La puerta de entrada cuando algo ya generado tiene que cambiar. No asume que la persona sepa qué
artefacto tocar: eso es lo que este comando averigua.

Hay **dos caminos**, y elegir el equivocado es el problema real. Parchear un cambio grande deja
artefactos que se contradicen entre sí; regenerar por un cambio chico paga retrabajo de más.

## Paso 1 — Entender qué quiere cambiar

Preguntá en lenguaje de negocio. **No pidas nombres de artefactos ni IDs.**

```
¿Qué necesitás cambiar?
```

Dejalo hablar. Si lo que dice es ambiguo, preguntá una cosa por vez hasta poder contestar dos
preguntas: **qué se quiere que diga ahora** y **qué dice hoy**.

## Paso 2 — Mapear a la cadena

Con eso, identificá qué artefactos tocan el pedido. Leé solo lo necesario: consultá
`proyectos/<slug>/metrics/workflow-status.json` para saber qué existe y en qué estado, y de ahí los
artefactos concretos.

Buscá el punto **más alto** de la cadena que el cambio afecta. No el más obvio: el más alto. Un
pedido que suena a "cambiar dos features" muchas veces empieza en una capacidad del roadmap.

## Paso 3 — Clasificar: ¿contradice o precisa?

Esta es la pregunta que decide, y no es cuántos artefactos toca:

| | Significa | Camino |
|---|---|---|
| **Precisa o completa** | El antecesor sigue siendo verdad. El cambio agrega detalle que no estaba, o lo aclara | **Ajustar** |
| **Contradice** | El antecesor pasa a decir algo falso | **Regenerar** desde ese antecesor |

El criterio es la trazabilidad, no el volumen. Cambiar el canal de notificación de mail a WhatsApp
toca dos features —poco volumen— pero **contradice** la capacidad del roadmap. Parchear las dos
features deja un roadmap que dice mail y features que dicen WhatsApp: en un mes nadie sabe cuál manda.

**Tercer nivel.** Si el cambio contradice la **iniciativa** —cambió el objetivo de negocio, no el
cómo— ni regenerar la visión alcanza. Decilo derecho: *"esto ya no es el mismo proyecto"*, y ofrecé
reabrir la iniciativa o arrancar uno nuevo con `/dsc-new`.

## Paso 4 — Mostrar las dos opciones con su costo real

El costo no lo estimes: sacalo del script.

```bash
node scripts/impact.mjs <slug> <etapa>[/<item>]
```

Devuelve los artefactos que quedarían obsoletos y **avisa cuáles tienen trabajo hecho a mano**
(`version > 1`), que es lo que se pierde al regenerar. Presentá las dos opciones y recomendá una:

```
Eso contradice la capacidad BC02 del roadmap, que dice mail.
Toca: EP002, R1, F005, F006 y sus 2 estimaciones.

  A · Regenerar desde el roadmap
      /dsc-roadmap → /dsc-review → /dsc-approve, y de ahí abajo
      5 artefactos se rehacen. La trazabilidad queda intacta.
      4 comandos, ninguna edición a mano.

  B · Ajustar F005 y F006
      2 ediciones, 2 estimaciones obsoletas, 2 entregas bloqueadas.
      El roadmap sigue diciendo mail: queda desalineado para siempre.
      8 comandos, 2 ediciones a mano.

Recomiendo A: el roadmap ya no dice la verdad, y parchear features sobre
un roadmap desactualizado es lo que hace que después nadie entienda por
qué la feature dice una cosa y la épica otra.

Ojo: F005 está en v2, o sea que alguien la trabajó a mano después de
generarla. Eso se pierde al regenerar — queda en
outputs/history/feature/F005/v2.md si hay que recuperarlo.

¿A o B?
```

**Recomendá, no decidas.** El techo no lo pone el modelo: el costo queda a la vista y elige la
persona. Si elige el camino que no recomendaste, seguí sin discutir — pero registralo con `/dsc-log`.

## Paso 5 — Ejecutar

### Camino A — regenerar

Corré el comando de la etapa desde la que se regenera. El gate de prerequisito
(`contracts/command-anatomy.md`) ya contempla que el artefacto esté `APPROVED`: pregunta si
regenerar y avisa que dispara la cascada `STALE`. No hay nada especial que hacer.

De ahí para abajo, la cadena de siempre: cada etapa se regenera, se revisa y se firma.

### Camino B — ajustar

En este orden exacto:

```bash
node scripts/reabrir.mjs <slug> <etapa>[/<item>] --motivo "<texto>" --by "<nombre>"
```

Eso pasa el artefacto a `IN_REVIEW`, sube la versión, marca obsoletos a sus descendientes y emite
el evento. **Recién después se edita el documento.** Al revés, el artefacto queda en `APPROVED` con
contenido que nadie firmó — que es exactamente el problema que este comando existe para evitar.

Después:

1. Editá **solo** lo que se pidió. No aproveches para mejorar otras partes: rompe la trazabilidad
   entre el pedido y el cambio.
2. `/dsc-review`
3. `/dsc-approve` con los roles que pida `config/review-policy.yaml`
4. `/dsc-log` con el motivo

Si `reabrir.mjs` lista más artefactos obsoletos de los que esperabas, **paralo y volvé al paso 4**:
el cambio era más grande de lo que parecía y probablemente correspondía regenerar.

## Cierre

Terminá con el estado real y el comando literal que sigue:

```
F005 quedó en v2 y volvió a "en revisión" — nadie firmó esta versión.
Su estimación quedó obsoleta.

F005 ya estaba entregada a desarrollo: quedó marcada para reenvío, y el
handoff está bloqueado hasta que se vuelva a firmar. Avisale al equipo
que el brief que tienen cambió.

Próximo paso: /dsc-review
```

Si la feature estaba `HANDED_OFF`, **decilo siempre**. Hay gente construyendo sobre eso y el modelo
no puede avisarles: solo puede avisarte a vos.

## Reglas

- Nunca edites un artefacto aprobado sin correr `reabrir.mjs` primero.
- Nunca dejes un artefacto en `APPROVED` después de cambiarlo.
- El costo sale de `impact.mjs`, no de tu criterio.
- Si el pedido contradice la iniciativa, decilo: no lo acomodes cambiando cosas de abajo.
