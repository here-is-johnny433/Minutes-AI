# Minutes.AI — Backlog de mejoras

**Objetivo:** llevar Minutes.AI de "herramienta local de un usuario" a **componente de organización sobre GCP que alimenta el lazo EOS** del proyecto Hermes-EOS.

- **Repo:** `github.com/here-is-johnny433/Minutes-AI`
- **Estado base (hoy):** SPA vanilla JS + pequeño `api` de auth · Docker/nginx · Gemini vía API key de Google AI Studio (o Gemini Nano on-device) · salida `.md` a carpeta local (File System Access API) o `localStorage` · auth local (`users.json`) · 5 plantillas · multi-idioma (incl. ES/MX).
- **Marca:** diseño / Por confirmar · Última actualización: 24 jun 2026.

> Documento de proyecto: ver "Proyecto Hermes-EOS" en Notion (HQ de Operaciones › Proyectos).
>
> **Seguimiento en GitHub:** este backlog también vive como Issues — épica de seguimiento [#13](https://github.com/here-is-johnny433/Minutes-AI/issues/13); cada ítem `MAI-0N` es el issue `#N` ([#1](https://github.com/here-is-johnny433/Minutes-AI/issues/1)–[#12](https://github.com/here-is-johnny433/Minutes-AI/issues/12)), etiquetado `P1`/`P2`/`P3` y `blocks-eos-loop`.

---

## Cómo leer este backlog

- **P1 — Imprescindible:** sin esto, Minutes.AI no encaja en la estrategia.
- **P2 — Gobernanza y calidad:** necesario para uso de organización y para el lazo completo.
- **P3 — Nice-to-have:** mejora la calidad de captura; no bloquea el piloto.

Cada ítem: **qué**, **para qué** (fit estratégico), **criterio de aceptación** y **dependencias**.

### Resumen

| ID | Mejora | Nivel | Bloquea el lazo EOS | Issue |
| --- | --- | --- | --- | --- |
| MAI-01 | Salida a Cloud Storage (GCS) | P1 | Sí | #1 |
| MAI-02 | Evento al finalizar minuta → Hermes | P1 | Sí | #2 |
| MAI-03 | Plantilla EOS/L10 con salida estructurada | P1 | Sí | #3 |
| MAI-04 | Modelo vía Vertex AI / Gemini Enterprise | P1 | — | #4 |
| MAI-05 | SSO Google Workspace (identidad) | P2 | — | #5 |
| MAI-06 | Resolución de dueños / asistentes | P2 | Parcial | #6 |
| MAI-07 | Bandera de confidencialidad + ruteo | P2 | — | #7 |
| MAI-08 | Enlace a entidades EOS (Rocks/Issues) | P2 | — | #8 |
| MAI-09 | Plantillas centralizadas | P2 | — | #9 |
| MAI-10 | Auditoría y versionado | P2 | — | #10 |
| MAI-11 | Cloud Speech-to-Text + diarización | P3 | — | #11 |
| MAI-12 | Telemetría de costo / tokens | P3 | — | #12 |

> **Las dos de mayor impacto:** MAI-03 (vuelve la minuta en registros limpios) y MAI-01 + MAI-02 (cierran el lazo con Hermes). Con esas, ya pasa de "app de minutas" a componente del sistema operativo.

---

## Nivel 1 — Imprescindibles

### MAI-01 · Salida a Cloud Storage (GCS)

- **Qué:** extender el `api` para escribir cada minuta `.md` directo a un **bucket de GCS** (prefijos por equipo/usuario), en vez de carpeta local (File System Access API) o `localStorage`.
- **Para qué:** GCS es la capa de archivos/memoria que Hermes lee. Da durabilidad, versionado y desacople del navegador.
- **Criterio de aceptación:** una minuta sintetizada aparece como objeto `.md` en el bucket, con su frontmatter, sin pasos manuales.
- **Dependencias:** proyecto GCP + bucket + credenciales de servicio (IAM).

### MAI-02 · Evento al finalizar minuta → Hermes

- **Qué:** al finalizar/guardar una minuta, disparar un evento **GCS object-finalize → Pub/Sub → Hermes (Cloud Run)**.
- **Para qué:** el lazo se vuelve reactivo (minuta lista → Hermes la procesa en minutos), sin polling.
- **Criterio de aceptación:** crear una minuta dispara un mensaje que Hermes recibe y procesa.
- **Dependencias:** MAI-01; tópico Pub/Sub; endpoint de Hermes.

### MAI-03 · Plantilla EOS/L10 con salida estructurada

- **Qué:** nueva plantilla que, además del minuto narrativo, emita un **bloque legible por máquina** (YAML/JSON o frontmatter) con: `to-dos` (dueño, fecha), `issues`, `decisiones`, `rocks_afectados`, `equipo`, `fecha`, `trimestre`.
- **Para qué:** permite a Hermes convertir la minuta en **registros tipados de forma determinista**, sin parsear prosa. Es la pieza que hace "encajar" la captura con el ritmo EOS.
- **Criterio de aceptación:** una minuta de L10 produce un bloque estructurado válido (pasa validación de esquema) con acuerdos, dueños y fechas.
- **Dependencias:** acordar el esquema EOS con el equipo (frontmatter del proyecto).

### MAI-04 · Modelo vía Vertex AI / Gemini Enterprise

- **Qué:** reemplazar la llave de Google AI Studio en el navegador por un **proxy server-side a Vertex AI / Gemini Enterprise**.
- **Para qué:** quita llaves del navegador, mantiene los datos dentro del proyecto GCP (residencia/seguridad), centraliza costo y deja el ruteo de modelos bajo el Consejo Digital & IA.
- **Criterio de aceptación:** la síntesis funciona sin que el navegador tenga una API key; el tráfico va a Vertex dentro de GCP.
- **Dependencias:** acceso a Gemini Enterprise / Vertex (partnership Google Cloud).

---

## Nivel 2 — Gobernanza y calidad

### MAI-05 · SSO con Google Workspace

- **Qué:** sustituir el auth local (`users.json`) por **SSO/OIDC con Google Workspace**.
- **Para qué:** identidades reales (no cuentas locales), acceso gobernado centralmente; base para asignar dueños reales.
- **Criterio de aceptación:** los usuarios entran con su cuenta corporativa; los roles se derivan del directorio.
- **Dependencias:** configuración de OAuth/OIDC en Workspace.

### MAI-06 · Resolución de dueños / asistentes

- **Qué:** mapear nombres/asistentes de la reunión a **personas del directorio** (Workspace).
- **Para qué:** que un To-Do extraído tenga un **dueño real** asignable, no solo un nombre suelto.
- **Criterio de aceptación:** los `to-dos` del bloque estructurado salen con un identificador de persona resoluble.
- **Dependencias:** MAI-05; MAI-03.

### MAI-07 · Bandera de confidencialidad + ruteo

- **Qué:** marcador "confidencial / no ingerir" por reunión que **enruta esas minutas a un bucket restringido** fuera del path que Hermes lee.
- **Para qué:** respeta automáticamente la regla de Junta Directiva / Alta Dirección (no entra al contexto de acceso amplio).
- **Criterio de aceptación:** una minuta marcada confidencial no llega al bucket/lazo de Hermes; queda en el área restringida.
- **Dependencias:** MAI-01.

### MAI-08 · Enlace a entidades EOS (Rocks/Issues)

- **Qué:** etiquetar la reunión con su equipo/L10 y trimestre, y permitir que los acuerdos **cuelguen de un Rock o Issue existente** (por ID).
- **Para qué:** los To-Dos se adjuntan al Rock/Issue correcto en vez de quedar sueltos.
- **Criterio de aceptación:** un selector (alimentado desde BigQuery/registros) permite vincular la minuta y sus ítems a entidades EOS.
- **Dependencias:** modelo de datos EOS en BigQuery; MAI-03.

### MAI-09 · Plantillas centralizadas

- **Qué:** mover las plantillas (hoy en `localStorage` de cada navegador) a un **store central**, gobernadas por Excelencia (la plantilla EOS canónica).
- **Para qué:** consistencia de minutas en toda la organización.
- **Criterio de aceptación:** todos los usuarios usan la misma plantilla EOS; un cambio central se refleja para todos.
- **Dependencias:** MAI-01/MAI-04 (backend disponible).

### MAI-10 · Auditoría y versionado

- **Qué:** activar **versionado de objetos en GCS**, conservar el **transcript crudo** junto al minuto, y registrar quién sintetizó/editó.
- **Para qué:** trazabilidad y cumplimiento (requisito de auditoría del proyecto).
- **Criterio de aceptación:** se puede ver el historial de versiones de una minuta y su transcript origen.
- **Dependencias:** MAI-01.

---

## Nivel 3 — Nice-to-have

### MAI-11 · Cloud Speech-to-Text + diarización

- **Qué:** ruta de transcripción de audio grabado con **Cloud Speech-to-Text**, con **diarización** (etiquetas de hablante) y modelos español-LatAm, como alternativa al Web Speech API del navegador.
- **Para qué:** mejor calidad en reuniones multi-hablante y mejor atribución de dueños.
- **Criterio de aceptación:** una grabación produce transcript con hablantes diferenciados.
- **Dependencias:** API de Speech-to-Text en GCP.

### MAI-12 · Telemetría de costo / tokens

- **Qué:** registrar uso de tokens/costo por reunión (vía el proxy de Vertex).
- **Para qué:** conecta con la decisión de presupuesto y ruteo de modelos.
- **Criterio de aceptación:** un tablero/registro muestra costo por reunión y acumulado.
- **Dependencias:** MAI-04.

---

## Lo que NO hay que cambiar (preservar)

- Salida en **archivos `.md`** legibles (calza con la capa de archivos).
- Ethos **privacy-first** (sin base en la nube de terceros).
- **Multi-idioma** (español ES/MX).
- **Editar el transcript antes de sintetizar** — clave para la calidad y el human-in-the-loop.
- La base de **plantillas** y la plantilla *Action-Item Focused* como punto de partida de MAI-03.

---

## Orden recomendado

1. **MAI-04** (Vertex) y **MAI-01** (GCS) — la base de infraestructura.
2. **MAI-03** (plantilla EOS estructurada) — el valor del lazo.
3. **MAI-02** (evento → Hermes) — cierra el lazo reactivo.
4. **MAI-05/06** (identidad + dueños) y **MAI-07** (confidencialidad) — listo para organización.
5. Resto (MAI-08/09/10) y Nivel 3 según madure el piloto.

---

## 🕓 Bitácora

- **2026-06-24** — Backlog creado a partir del análisis de gaps de Minutes.AI vs. la estrategia GCP/Hermes-EOS. Marca: Por confirmar (diseño).
