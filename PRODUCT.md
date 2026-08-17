# Verdad de producto: Pokédex Manager

<!-- impeccable:product-schema 1 -->

Esta ficha es la fuente de verdad de producto para Pokédex Manager. Distingue lo confirmado por el plan y por la evidencia del repositorio de lo que permanece abierto; no presenta una aplicación futura como si ya estuviera disponible.

## Plataforma

web

## Hechos confirmados

- El producto es una aplicación web adaptable para explorar datos de Pokémon y gestionar una colección personal.
- El repositorio contiene una aplicación ejecutable con autenticación, catálogo cacheado, colección, estadísticas, expediciones verificables con procedencia explícita, reconocimiento visual con activación expresa y asistente contextual.
- La comunicación dirigida a personas debe usar español neutral. Los identificadores técnicos y los nombres oficiales de APIs pueden conservar el inglés cuando sea necesario para la interoperabilidad.
- La accesibilidad es un requisito de producto: WCAG AA, navegación por teclado, foco visible, adaptación a distintos tamaños y respeto por la preferencia de movimiento reducido.
- La dirección diferenciadora es una experiencia de expediciones adaptativas con objetivos verificables y progreso contextualizado por el estado de la colección.

## Usuarios

El usuario principal previsto es una persona coleccionista de Pokémon que, durante una sesión de exploración o mantenimiento de su colección, necesita encontrar información confiable, revisar detalles y registrar el estado de sus piezas sin perder contexto. Sus trabajos principales son explorar el catálogo, buscar y comparar Pokémon, mantener una colección aislada por cuenta y entender su progreso.

Investigación comienza vacía y requiere una generación explícita con Kimi. Un modo local acotado del asistente sí está disponible sin IA. Kimi analiza imágenes, genera hallazgos e investigación mediante adaptadores directos validados; el asistente usa herramientas MCP verificables de solo lectura.

## Propósito del producto

Pokédex Manager existe para reunir exploración de datos de Pokémon y gestión personal de una colección en un flujo web claro, seguro y verificable. El propósito es reducir el trabajo de buscar, organizar y comprender una colección, manteniendo separadas la evidencia objetiva, el contenido generado y las decisiones de la persona usuaria.

## Posicionamiento

El diferenciador principal de Pokédex Manager es la integración verificable de LLMs desde el inicio de la experiencia. El asistente obtiene contexto mediante herramientas MCP de solo lectura; reconocimiento, hallazgos e investigación usan adaptadores Kimi directos. En todos los flujos, el servidor conserva validación, aislamiento por cuenta y autoridad sobre los datos.

## Capacidades y límites

### Capacidades implementadas

- Explorar PokéAPI mediante catálogo, búsqueda, filtros por tipo, generación, habilidad y categoría Pokédex, orden global por generación o estadísticas base, paginación y fichas con nombres y descripciones disponibles en español. Habilidad y categoría usan autocompletado validado por la lista del proveedor.
- Mantener una colección personal con autenticación, aislamiento por usuario, cantidad, favoritos, apodo, notas, etiquetas y eliminación.
- Mostrar un dashboard con resumen y estadísticas deterministas.
- Convertir estadísticas de colección en hechos verificables y permitir que Kimi genere una interpretación narrativa libre, manteniendo los hechos calculados separados y guardados por versión de colección.
- Con Kimi habilitado, generar o regenerar explícitamente una expedición cuya narrativa proviene del modelo; el servidor conserva la selección de objetivos, criterios y metas verificables. El progreso y el estado se derivan de la colección sin escrituras durante una consulta. Sin una generación válida no existe investigación actual. MCP expone la investigación y su procedencia mediante operaciones de solo lectura con bearer.
- Identificar cartas en `/app/scan` mediante una imagen validada, Kimi y resolución contra PokéAPI, siempre con confirmación humana antes de agregar a la colección; si la propuesta no coincide, la persona puede reintentar la misma imagen y añadir una indicación.
- Consultar en `/app/assistant` catálogo, colección, estadísticas, comparaciones e investigación mediante una sesión MCP de solo lectura cuyo principal es la cuenta autenticada. Kimi descubre y selecciona herramientas MCP cuando está habilitado; el enrutador determinista usa la misma frontera como respaldo. Ambos conservan historial aislado por cuenta y hechos citados. La conversación sigue automáticamente la respuesta, muestra llamadas MCP reales en tiempo real, Markdown seguro y fuentes con nombre.

### Límites confirmados

- No hay escritura mediante MCP. El reconocimiento visual y la generación de expediciones no funcionan sin Kimi; Investigación permanece vacía y solo el modo local acotado del asistente funciona sin proveedor de IA, manteniendo MCP como frontera de contexto. La conversación natural requiere Kimi.
- Kimi recibe agregados de colección y contexto de candidatos ejecutables para orientar la narrativa de investigación; en el asistente recibe el texto de la conversación y resultados acotados de herramientas de solo lectura. No recibe identidad, notas sin procesar ni autoridad para modificar colección, progreso o estado.
- El modelo no escribe directamente en MongoDB ni decide el aislamiento por cuenta. Las fronteras externas se validan y los resultados generados se tratan como no confiables hasta su validación. Hallazgos, Investigación y Reconocimiento muestran las fases reales del proceso sin inventar porcentajes de avance.
- Las integraciones externas deben tener contratos y simulaciones deterministas antes de depender de servicios reales. Las claves y secretos permanecen en servidor.
- La dirección del producto no autoriza inventar clientes, precios, métricas, testimonios, despliegue, licencias o activos.

## Contexto operativo

El contexto operativo es una aplicación web adaptable usada durante sesiones de consulta y mantenimiento de una colección personal. El entorno local completo se inicia con Docker Compose; Atlas y Kimi son opcionales y requieren activación explícita. OAuth externo no forma parte del MVP.

## Evidencia de éxito

### Evidencia medible y observable

- Los contratos de bootstrap, toolchain, Kimi y MCP se ejecutan con Vitest y verifican límites de seguridad e interoperabilidad.
- La base se puede validar con instalación congelada, lint, formato, typecheck, suite de pruebas y build mediante pnpm.
- La UI conserva navegación por teclado, foco visible, adaptación móvil y estados de operación.

Las pruebas de integración verifican autenticación, aislamiento por cuenta y persistencia. La prueba de humo de Compose verifica arranque, salud y catálogo contra el contenedor construido. No existen métricas de usuarios reales.

## Evidencia disponible

- `openspec/changes/archive/2026-08-14-bootstrap-core-and-validate-integrations/`: propuesta, diseño, tareas, especificaciones y verificación históricas.
- Contratos implementados en `tests/contracts/bootstrap.test.ts`, `tests/contracts/toolchain.test.ts`, `tests/contracts/kimi.test.ts`, `tests/contracts/mcp.test.ts` y `tests/contracts/product-design.test.ts`.
- Pruebas de entorno e integración implementadas en `tests/unit/env.test.ts`, `tests/integration/mongo-client.test.ts`, `tests/integration/db-init.test.ts` y `tests/integration/better-auth-mongo.test.ts`.
- No hay testimonios ni casos de estudio disponibles.
- No hay métricas de producción, mediciones comparativas ni telemetría de usuarios disponibles.
- No hay activos visuales ni archivos tipográficos con disponibilidad y licencia verificadas.

## Principios de producto

- **La tarea primero:** cada futura superficie debe ayudar a completar el trabajo real antes que decorar la experiencia.
- **Evidencia antes que afirmaciones:** los datos objetivos, los resultados generados y las decisiones humanas deben poder distinguirse.
- **Contexto personal aislado:** autenticación, autorización y pertenencia de los datos son límites de seguridad, no detalles opcionales.
- **Progreso verificable:** una recomendación o expedición futura debe apoyarse en datos y objetivos comprobables.
- **Calidad como criterio principal:** funcionalidad, seguridad, accesibilidad, pruebas y mantenibilidad avanzan juntas.

## Accesibilidad e inclusión

El producto debe cumplir WCAG AA y conservar la funcionalidad en distintas anchuras de pantalla. Las superficies futuras deben ser operables con teclado, mantener foco visible, expresar los estados sin depender solo del color, ofrecer mensajes comprensibles en español neutral y respetar `prefers-reduced-motion`. La adaptación debe reorganizar la información sin ocultar tareas esenciales.

## Compromisos de marca

El nombre de producto es Pokédex Manager. La voz destinada a personas será clara, profesional y en español neutral. La asociación con Pokémon se expresa como dirección de producto y contexto de colección; no autoriza copiar activos, logotipos, tipografías o licencias que no estén verificadas.

## Decisiones abiertas y elementos futuros

- No hay clientes, usuarios reales, testimonios ni casos de estudio confirmados.
- No hay precios, modelo comercial, métricas de producción ni mediciones comparativas decididas.
- El proveedor de infraestructura productiva y las licencias de activos o fuentes no están definidos ni verificados. Existe un contrato Docker genérico para un servidor con Atlas y proxy TLS.
- Los datos iniciales de demostración y OAuth externo quedan fuera del MVP ejecutable.
- Las fuentes de marca solo podrán incorporarse después de verificar archivos, licencia, cobertura de caracteres, legibilidad y rendimiento.
