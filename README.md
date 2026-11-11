# Discovery Model

De una idea de negocio a features que el equipo de desarrollo puede construir sin volver a preguntar nada.

Está pensado para **PM, PO, BA y stakeholders**. No hay que saber programar ni abrir una terminal:
se trabaja conversando en la app de escritorio de Claude Code.

## Qué problema resuelve

Hoy una iniciativa se discute en reuniones, alguien escribe un documento, otro escribe otro, y el
equipo de desarrollo recibe algo ambiguo que lo obliga a preguntar todo de nuevo. Cuando alguien
pregunta seis meses después por qué una funcionalidad quedó afuera, nadie sabe.

Este modelo hace tres cosas:

1. **Interroga hasta que no queda ambigüedad** — antes de escribir nada.
2. **Encadena los artefactos** — cada uno se construye sobre el anterior aprobado, y nada avanza sin firma humana.
3. **Deja el rastro** — por qué se decidió cada cosa, quién lo decidió y cuándo.

## La cadena

```
ideas/  →  iniciativa  →  visión  →  roadmap  →  release  →  features  →  desarrollo
```

Cada paso tiene su comando y su aprobación. La última etapa entrega un `brief.md` al
[sdd-model](../sdd-model) tan completo que lo toma **sin necesidad de preguntar** — esa es la
**meta** del modelo. Si SDD igual encuentra un hueco, pregunta y lo devuelve como feedback: la
meta es que no haga falta, no prohibirle que lo haga.

## Cómo empezar

```
/dsc-setup     verifica que tu máquina pueda correrlo
/dsc-explain   cómo funciona, en 5 minutos
/dsc-new "Mi proyecto"
```

Después poné en `ideas/` todo lo que ya tengas — minutas, entrevistas, relevamientos, mails — y
corré `/dsc-refine`.

Cuando no sepas qué sigue: **`/dsc-status`**. Siempre te dice el próximo comando.

## Tablero

`dashboard/index.html` se abre con doble clic. No necesita internet ni servidor: es un archivo
estático que se regenera con cada aprobación.

## Decisiones de diseño

- **Sin servidores.** Ningún componente abre puertos ni queda corriendo.
- **Sin dependencias externas.** Solo Node. Nada de terceros se ejecuta en las máquinas del equipo.
- **El modelo nunca aprueba.** Registra firmas que dio una persona.
- **`ideas/` es material no confiable.** Se escanea por instrucciones inyectadas y por secretos antes de procesarlo.

Las reglas completas están en [constitution.md](constitution.md).

## Documentación

| Documento | Para qué |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Contexto operativo y lista de comandos |
| [constitution.md](constitution.md) | Principios no negociables |
| [docs/blueprint.md](docs/blueprint.md) | Diseño completo y planning |
| [docs/gap-analysis.md](docs/gap-analysis.md) | Diagnóstico del modelo anterior |
| [specs/](specs/) | Specs de construcción, fase por fase |
| [contracts/](contracts/) | Rutas, estado e identificadores |

## Estado

En construcción, por fases. **Fase 001 (Fundación) completa**: `/dsc-setup`, `/dsc-explain`,
`/dsc-new`, `/dsc-status` y el dashboard mínimo. El resto está especificado en `specs/` y el
avance se sigue en `specs/_registry/features.yaml`.
