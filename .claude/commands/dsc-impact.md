---
description: Muestra qué artefactos quedarían obsoletos si se cambia uno aprobado. No modifica nada.
---

# /dsc-impact

Se corre **antes** de cambiar algo aprobado. Cambiar la visión con veinte features definidas
tiene un costo; la decisión se toma sabiendo cuál es.

No modifica nada.

## Uso

```bash
node scripts/impact.mjs <slug> <etapa>[/<item>]
```

## Cómo presentarlo

Traducí la salida a consecuencias de negocio, no a nombres de archivo:

```
Si cambiás la visión, esto queda obsoleto y hay que rehacerlo:

  El roadmap completo           (6 épicas)
  El release R1                 (3 épicas planificadas)
  7 features                    F001 a F007

Ninguna se borra: se siguen pudiendo leer y comparar. Pero no vas a poder
avanzar a desarrollo hasta regenerarlas y volver a aprobarlas.

Si el cambio es chico y no toca usuarios, objetivos ni capacidades, puede
convenir ajustarla en vez de regenerar la visión entera. /dsc-change decide cuál
de los dos caminos conviene y lo ejecuta.
```

Si no hay nada aprobado aguas abajo, decilo claro: **el cambio no cuesta retrabajo**.

## Cuándo ofrecerlo sin que lo pidan

Cuando el usuario diga que quiere cambiar algo ya aprobado, corré esto **primero**, antes de
tocar nada. Es más barato mostrar el costo que descubrirlo después.

## Reglas

- No modifiques ningún artefacto ni el estado.
- No decidas por el usuario si el cambio vale la pena: mostrá el costo y que decida.
- Si decide avanzar, recordale `/dsc-log`.
