# Contrato de handoff

`contract_version: 2`

El borde entre Discovery y el equipo de desarrollo. Es la razón de ser del modelo: si esto
funciona, hacer Discovery ahorra trabajo; si no, lo duplica.

**Objetivo, medible (no prohibición):** que `/sdd-refine` sobre un brief exportado registre
`rondas_de_preguntas: 0` y `categorias_faltantes: 0`. Es la **meta de salud** del handoff, no una
mordaza sobre SDD: SDD conserva el derecho a preguntar si encuentra una ambigüedad genuina que lo
obligaría a suponer. Una pregunta de SDD **no es un fallo** — es la señal de que quedó un hueco, y
vuelve como feedback (`QUESTION`/`MAJOR`, ver `feedback.md`) contra la feature de origen para
taparlo acá. Cuanto más cerca de 0, mejor hicimos Discovery; un número mayor es feedback, no un
veredicto.

---

## El paquete

```
proyectos/<slug>/outputs/handoff/<feature_id>/
├── brief.md      ← lo único que /sdd-refine consume
├── context.md    ← de dónde viene la feature. Informativo, para el humano
└── assets/       ← .html de referencia, wireframes
```

## `brief.md`

```yaml
---
contract_version: 1
discovery_id: F001
feature_id: 001-gestion-usuarios
domain: identidades
size: M
epic: EP001
release: R1
capability: BC01
users: U01, U03
proyecto_id: PRY-001
vision_ref: proyectos/gestion-de-stock/outputs/vision/vision.md
decisions: DEC-004, DEC-011
source_model: discovery-model
generated: 2026-08-10
---

## PROBLEMA
## USUARIO
## DONE CRITERIA
## OUT OF SCOPE
## RESTRICCIONES TÉCNICAS
## UI / FLUJO
```

Los seis títulos son **literales**: son exactamente los que `/sdd-refine` busca. Cambiar una
palabra, una tilde o el orden hace que el grilling se dispare igual.

## Mapeos deterministas

| Discovery | SDD | Regla |
|---|---|---|
| `F001` + slug `gestion-usuarios` | `001-gestion-usuarios` | Quitar el prefijo `F`, conservar el slug |
| `BC01` / `EP001` | `domain` | Vía `registry/capabilities.yaml` → `sdd_domain` |
| `R1` | `specs/_registry/sprints/YYYY-SNN` | Un release puede abarcar varios sprints. Lo decide el equipo de desarrollo |
| `size: XL` | **no cruza** | `/dsc-split` obligatorio |
| `DEC-nnn` | `DECISIONS.md` de SDD | Se referencia por ID, **nunca se copia** |

Dos logs sincronizados divergen; dos logs referenciados no.

## Gate de exportación

El handoff **se rechaza y no escribe nada** si:

| # | Condición | Por qué |
|---|---|---|
| 1 | Falta alguna de las 6 secciones | `/sdd-refine` va a preguntar por ella igual |
| 2 | Hay placeholders (`TBD`, `[Completar]`, `Pendiente`, `N/A`, `???`) | Un placeholder que cruza se convierte en una suposición del desarrollador |
| 3 | `size` es `XL` o falta | Una feature XL en desarrollo es retrabajo garantizado |
| 4 | El `domain` no resuelve en `capabilities.yaml` | `/sdd-generate` lo exige y lo tendría que inventar |
| 5 | El `feature_id` ya existe en el repo destino | Pisaría trabajo ajeno |
| 6 | Hay patrones de secreto en el brief | Mismo check que `/sdd-refine`, corriendo **antes** de que el secreto cruce |
| 7 | La feature no está `APPROVED` | Se entregaría algo que nadie firmó |

El 6 es el más importante de los que no son obvios: es la última barrera antes de que una
credencial entre a un repositorio versionado, donde queda en el historial para siempre.

## Destino

`--target <ruta>` es el camino feliz, no el único.

**Con `--target`:** se valida que sea un repo SDD real —tiene que existir
`.claude/commands/sdd-refine.md`— se rechazan rutas con `..`, y nunca se sobreescribe sin
confirmación. El brief se escribe en `<target>/drafts/`.

**Sin `--target`, o si el repo no es accesible:** se escribe en `outputs/handoff/` con las
instrucciones de entrega manual. **No es un error.** Si el PM trabaja en una carpeta sincronizada
y el repo de desarrollo está en la máquina de otra persona, ese es el flujo normal.

## Qué cambia del lado SDD

Tres parches **aditivos**. `sdd-model` sin Discovery se comporta exactamente igual que antes.

| # | Archivo | Cambio |
|---|---|---|
| P1 | `specs/_registry/features.template.yaml` | Campos opcionales `discovery_id`, `epic`, `release`, `size`. `null` si la feature no vino de Discovery |
| P2 | `.claude/commands/sdd-refine.md` | Si existe `drafts/brief.md` con `discovery_id`: validar las 6 secciones y **correr igual la verificación de ambigüedad** — el grilling **no se saltea**. No re-preguntar lo que ya está claro (un brief bien hecho da `rondas_de_preguntas: 0`), pero preguntar donde haya ambigüedad genuina o falte una sección, y devolver eso a Discovery como feedback. El check de seguridad se mantiene siempre |
| P3 | `.claude/commands/sdd-generate.md` | Usar `feature_id` y `domain` del brief en vez de proponerlos. Propagar la trazabilidad al registro |

El bypass es sobre el **grilling**, nunca sobre la validación de seguridad: un brief también es
input externo desde el punto de vista del repo de desarrollo.

## Versionado

El `contract_version` viaja en el frontmatter. Si SDD recibe una versión que no conoce, avisa en
vez de interpretar mal.

Es la defensa contra la deriva entre los dos modelos cuando evolucionen por separado: sin esto,
un cambio en el template de feature rompe el handoff en silencio y nadie se entera hasta que un
desarrollador pregunta algo que Discovery creía haber respondido.
