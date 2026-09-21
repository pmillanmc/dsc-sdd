# Contrato de rutas

Raíz única. Ningún agente ni comando escribe fuera de lo que declara este documento.
Existe porque el modelo anterior tenía cinco convenciones coexistiendo y la cadena se cortaba en dos puntos.

## Árbol de un proyecto

```
proyectos/<slug>/
├── ideas/                              ← borradores de ESTE proyecto, input no confiable
├── iniciativa.md                       ← salida de /dsc-refine
├── iniciativa.draft.md                 ← estado parcial del grilling (se borra al confirmar)
├── outputs/
│   ├── vision/vision.md
│   ├── roadmap/roadmap.md
│   ├── roadmap/roadmap.html            ← vista, nunca fuente de verdad
│   ├── releases/R<n>.md
│   ├── features/F<nnn>-<slug>.md
│   ├── estimations/F<nnn>.md
│   ├── reviews/<tipo>/<id>/v<n>-feedback.yaml
│   ├── approvals/<tipo>/<id>/v<n>-approval.md
│   ├── history/<tipo>/<id>/v<n>.md     ← reemplaza al historial de git
│   └── handoff/<feature_id>/
│       ├── brief.md
│       ├── context.md
│       └── assets/
└── metrics/
    ├── workflow-status.json
    ├── project-metrics.json
    ├── estado.json                      ← plan vigente: lo que se publica afuera
    ├── base/F<nnn>-v<n>.json            ← linea base por entrega, inmutable
    ├── events.jsonl
    └── audit-result.json
```

`<tipo>` ∈ `iniciativa | vision | roadmap | release | feature`
`<id>`: `iniciativa`, `vision`, `roadmap`, `R1`, `F001`

## Raíz del modelo

| Ruta | Contenido | Quién escribe |
|---|---|---|
| `templates/` | Plantillas de artefacto | Mantenimiento del modelo |
| `config/` | `workflow`, `governance`, `review-policy` | El humano |
| `contracts/` | Este documento y sus pares | Mantenimiento del modelo |
| `registry/` | Índices globales | `lib/registry.mjs` |
| `proyectos/` | Un directorio por proyecto | `/dsc-new` |
| `dashboard/` | `shell.html` (plantilla, se edita a mano) | Mantenimiento del modelo |
| `dashboard/` | `index.html` (tablero autocontenido), `data.js` | `gen-dashboard.mjs` |
| `lib/`, `scripts/` | Código | Mantenimiento del modelo |
| `specs/`, `docs/` | Construcción del propio modelo | Mantenimiento del modelo |
| `DECISIONS.md` | Registro de decisiones | `/dsc-log` |

## Reglas

1. **Namespace obligatorio.** Todo artefacto de negocio vive bajo `proyectos/<slug>/`. No hay artefactos en la raíz.
2. **Un slug es minúsculas, números y guiones.** `/dsc-new` normaliza y reporta el slug resultante.
3. **Rutas siempre citadas.** La ruta del proyecto puede tener espacios y acentos (`C:\Users\PatricioMillán\…`). Todo script y todo comando cita sus rutas. Es causa habitual de fallos silenciosos en Windows.
4. **Ningún agente explora libremente.** Lee las rutas que su contrato declara y nada más. Ver `artifact-creator-contract.md`.
5. **El `.html` es vista, no fuente.** `roadmap.html` y `dashboard/` se regeneran; editarlos a mano se pierde.
6. **Escritura fuera de `proyectos/`** solo en el handoff, con destino validado y confirmado. Ver `handoff.md`.

## Rutas eliminadas

No deben aparecer en ningún archivo. El gate de la fase 002 lo verifica con `grep`.

`sdd-harness/` · `proyecto-planning/` · `discovery/` · `outputs/` en la raíz · `templates/vision/` · `vision/` `roadmap/` `releases/` `features/` planas
