# Entrega a desarrollo

## El criterio

El **objetivo** es que `/sdd-refine` genere `input.md` sin preguntar: `rondas_de_preguntas: 0`.
Es la métrica de salud del handoff, no una prohibición sobre SDD.

Si SDD pregunta algo, quedó un hueco en el Discovery: no es un fallo prohibido, es una **señal**.
SDD lo resuelve con el humano para no frenar y lo devuelve como feedback (`QUESTION`/`MAJOR`)
contra la feature de origen, para taparlo en la fuente. Cada handoff mide el modelo; cuanto más
cerca de 0, mejor.

## El paquete

```
outputs/handoff/<feature_id>/
├── brief.md      ← lo único que /sdd-refine consume
├── context.md    ← de dónde viene, para el humano
└── assets/       ← .html de referencia, wireframes
```

Las **seis secciones del brief son títulos literales**: `## PROBLEMA`, `## USUARIO`,
`## DONE CRITERIA`, `## OUT OF SCOPE`, `## RESTRICCIONES TÉCNICAS`, `## UI / FLUJO`.
Cambiar una palabra o una tilde hace que el grilling se dispare igual.

El bloque Discovery de la feature (valor de negocio, reglas, riesgos) **no se exporta**:
desarrollo no lo consume, y lo que no se consume envejece.

## Mapeos

| Discovery | SDD |
|---|---|
| `F001` + slug | `001-<slug>` — quitar la `F` |
| `BC01` / `EP001` | `domain`, vía `registry/capabilities.yaml` |
| `R1` | sprint SDD, lo decide desarrollo |
| `size: XL` | **no cruza** |
| `DEC-nnn` | se referencia por ID, **nunca se copia** |

Dos registros sincronizados divergen; dos referenciados no.

## El gate

Rechaza y no escribe nada si: falta una sección, hay placeholders, el talle es XL o falta, el
dominio no resuelve, el `feature_id` ya existe en destino, hay secretos, o la feature no está
`APPROVED`.

El de secretos es la última barrera antes de que una credencial entre a un repositorio
versionado, donde queda en el historial para siempre.

## El destino

`--target` es el camino feliz, no el único. Si el repo está en otra máquina, el paquete queda
local con instrucciones de entrega manual. **No es un error.**

Solo se registra `target_repo` si efectivamente se escribió ahí: anotar un destino al que no se
llegó haría que el portfolio reporte una entrega que no ocurrió.

## Del lado SDD

Tres parches aditivos (P1, P2, P3) descritos en `contracts/handoff.md`. **`sdd-model` sin
Discovery se comporta exactamente como antes.** El bypass es sobre el grilling, nunca sobre la
validación de seguridad: un brief también es input externo para el repo que lo recibe.

El `contract_version` viaja en el frontmatter. Si SDD recibe una versión que no conoce, avisa en
vez de interpretar mal — es la defensa contra la deriva entre los dos modelos.
