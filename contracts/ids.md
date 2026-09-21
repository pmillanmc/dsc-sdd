# Contrato de identificadores

Los IDs son la columna vertebral de la trazabilidad: `PRY-001 → BC01 → EP001 → R1 → F001 → 001-slug`.
Si colisionan o se saltan, la cadena se rompe en silencio.

## Formatos

| Prefijo | Entidad | Formato | Alcance | Ejemplo |
|---|---|---|---|---|
| `INI` | Iniciativa | `PRY-nnn` | Global | `PRY-001` |
| `U` | Usuario / persona | `Unn` | Por proyecto | `U01` |
| `BC` | Capacidad de negocio | `BCnn` | Por proyecto | `BC01` |
| `OE` | Objetivo estratégico | `OE-nnn` | Por proyecto | `OE-001` |
| `EP` | Épica | `EPnnn` | Por proyecto | `EP001` |
| `R` | Release | `Rn` | Por proyecto | `R1` |
| `F` | Feature | `Fnnn` | Por proyecto | `F001` |
| `DEC` | Decisión | `DEC-nnn` | Global | `DEC-001` |
| `FB` | Ítem de feedback | `FB-nnn` | Por review | `FB-001` |
| `CHK` | Ítem de checklist | `CHKnnn` | Por feature | `CHK001` |

## Regla central

**Los IDs se asignan desde `registry/ids.yaml`, nunca contando archivos.**

Contar archivos parece funcionar hasta que dos personas trabajan en paralelo sobre la carpeta sincronizada: ambas ven tres features, ambas crean `F004`. El registro es el único que sabe cuál fue el último entregado.

### Qué contador viaja y cuál no

`DEC` numera decisiones sobre **el modelo**: es del framework, se versiona y viaja
con el repo, en `registry/decisiones.yaml`.

Todo el resto —`PRY`, `U`, `BC`, `OE`, `EP`, `R`, `F`— numera trabajo de un
cliente. Vive en `registry/ids.yaml`, que es **local a la máquina del PM** y está
gitignoreado, igual que `proyectos/`.

Tenerlos juntos hacía que un mismo archivo fuera a la vez estado compartido y
estado local: conflictuaba en cada merge, y los nombres de los proyectos
terminaban commiteados sin que nadie lo decidiera.

**Un contador local no evita colisiones entre clones.** Dos personas en ramas
distintas pueden reservar el mismo `DEC-nnn` y cada una creerse dueña: pasó, y se
resuelve renumerando en el merge. La regla de no contar archivos sigue valiendo
dentro de una máquina, que es donde fue pensada.

```yaml
# registry/decisiones.yaml — versionado
DEC: 12

# registry/ids.yaml — local, gitignoreado
global:
  PRY: 1
proyectos:
  gestion-identidades:
    U: 4
    BC: 6
    OE: 3
    EP: 6
    R: 2
    F: 12
```

Cada valor es **el último asignado**, no el próximo.

## Asignación

`lib/registry.mjs` expone `reservar(tipo, proyecto, cantidad)`:

1. Releer `ids.yaml` del disco. Nunca usar una copia en memoria de un turno anterior.
2. Incrementar el contador.
3. Escribir de forma atómica (`.tmp` + rename).
4. Devolver los IDs reservados.

Reservar y escribir ocurren en el mismo turno. Si el archivo cambió entre la lectura y la escritura, se aborta y se reintenta una vez.

## Reglas

1. **Nunca se reutiliza un ID**, ni siquiera si el artefacto se borró. El contador solo sube.
2. **Nunca se renumera.** Si `F002` se divide, nacen `F013` y `F014`; `F002` queda `SUPERSEDED`. Renumerar rompe toda referencia previa, incluidas las que ya cruzaron a SDD.
3. **Los IDs de usuario atraviesan toda la cadena.** Un `U01` definido en la Visión se referencia en la épica, en el release y en la sección `## USUARIO` de la feature. Es lo que permite derivar esa sección sin volver a preguntar.
4. **El slug es parte del nombre de archivo, no del ID.** `F001` es el ID; `F001-gestion-usuarios.md` es el archivo. Cambiar el slug no cambia el ID.
5. **El check 10 del audit** verifica unicidad y ausencia de saltos.

## Mapeo a SDD

| Discovery | SDD | Regla |
|---|---|---|
| `F001-gestion-usuarios` | `001-gestion-usuarios` | Quitar el prefijo `F`, conservar el slug |
| `BC01` / `EP001` | `domain` | Vía `registry/capabilities.yaml` |
| `R1` | `specs/_registry/sprints/YYYY-SNN` | Un release puede abarcar varios sprints |
| `DEC-nnn` | `DECISIONS.md` de SDD | Se referencia por ID, nunca se copia |

El `feature_id` de SDD se calcula al hacer el handoff y se guarda en `registry/features.yaml`. A partir de ahí es inmutable: es la única forma de seguir el hilo entre los dos modelos.
