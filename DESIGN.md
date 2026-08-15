# Sistema visual de Pokédex Manager

## Modo

Operación

## Dirección

La interfaz se comporta como un índice de campo y un libro de registro de laboratorio: información compacta, renglones estables, numeración visible y controles familiares. Rechaza el catálogo de tarjetas intercambiables. La identidad aparece en la precisión de las tablas, las etiquetas de tipo y un rojo mineral reservado para acciones principales y estados activos.

## Principios

- **Orientación a tareas:** cada vista prioriza la acción, el estado y la siguiente decisión.
- **Scanabilidad:** títulos informativos, columnas estables y filas con jerarquía clara permiten comparar sin leer todo.
- **Accesibilidad:** WCAG AA, foco visible, navegación por teclado y mensajes que no dependen solo del color.
- **Responsive estructural:** los listados reorganizan columnas como filas rotuladas y las herramientas se divulgan progresivamente sin ocultar funciones.
- **Divulgación progresiva:** la lista muestra identidad y señales clave; el detalle conserva estadísticas, habilidades y acciones.

## Tokens

- Fondo de papel técnico: `#f3f1e8`; superficie: `#fffdf7`; tinta: `#18211f`; tinta secundaria: `#59625e`.
- Línea: `#c9cec8`; línea fuerte: `#8d9690`; acción mineral: `#b4232f`; acción oscura: `#861a23`; éxito: `#23643f`; aviso: `#8a5a00`.
- Cuerpo e interfaz: `"Open Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Se incluyen localmente pesos 400, 600, 700 y 800 mediante Fontsource.
- Grandes momentos de marca y `h1`: `"Modified ITC Kabel Ultra", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif`.
- Etiquetas de laboratorio, índices y navegación especial: `"Eurostile Extended Bold", "Arial Narrow", "Aptos Display", "Open Sans", sans-serif`.
- Modified ITC Kabel Ultra y Eurostile Extended Bold son rostros comerciales: sus nombres exactos quedan configurados, pero solo se activan si el despliegue recibe archivos licenciados. El repositorio no incorpora, descarga ni presenta las fuentes alternativas como si fueran esas tipografías.
- No se incorporan fuentes ni activos de marca comerciales cuyas licencias estén sin verificar.
- Radios contenidos entre `4px` y `12px`; controles de `44px` como mínimo. Las superficies usan borde o sombra, nunca ambos.
- El ancho de lectura continua se limita a `72ch`; los datos operativos pueden ocupar el ancho disponible.

## Iconografía

- Se usa exclusivamente el iconfont de [HackerNoon Pixel Icon Library](https://pixeliconlibrary.com) mediante `<i className="hn hn-…" aria-hidden="true">`.
- Todo control interactivo conserva texto visible o nombre accesible. No se mezclan familias de iconos.
- Los iconos se usan sin modificaciones bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) y la atribución aparece en README y Ajustes.

## Navegación adaptable

- Desde `981px`, una barra lateral fija agrupa Registro, Trabajo de campo y Sistema; muestra icono, texto, estado activo y cuenta.
- Hasta `980px`, una cabecera compacta y fija durante el desplazamiento abre un `dialog` modal nativo con fondo, cierre explícito, Escape, contención de foco y todos los destinos secundarios.
- El botón flotante del asistente aparece en rutas autenticadas excepto `/app/assistant`; respeta las áreas seguras, mide al menos `44px` y pasa a icono con nombre accesible en anchos estrechos.
- Los puntos de control de `1180`, `980`, `800`, `720` y `480px` reorganizan formularios, tablas, colección, métricas, escaneo y asistente. La anchura mínima soportada es `320px` sin desbordamiento horizontal de página.

## Componentes

- Listados con cabecera de columnas en escritorio y valores rotulados mediante `data-label` en móvil.
- Filtros Pokédex en planilla operativa; en móvil se convierten en divulgación nativa con resumen persistente de filtros activos.
- Botón primario sólido; secundarios de superficie; peligro reservado para eliminación explícita.
- Etiquetas de tipo compactas con tinta, borde y superficie propios; nunca comunican solo mediante color.
- Formularios con etiqueta siempre visible, ayuda y error cercanos; foco de dos píxeles con separación.
- Investigación muestra un estado vacío hasta que la persona genera una expedición con IA. Solo las expediciones `mode=kimi` se presentan como activas y muestran su procedencia; los registros heredados por reglas no se exponen como sustituto. La acción explica disponibilidad y validación antes de persistir o reemplazar.
- Hallazgos separa la evidencia calculada de la interpretación Kimi. Cada interpretación conserva visible el hecho permitido que la sustenta; nunca presenta narrativa generada como métrica objetiva.
- Hallazgos, Investigación y Reconocimiento comparten un registro de proceso SSE: pasos reales, paso activo, tiempo transcurrido, cierre verificado o interrupción. El marcador activo es la única animación continua y se detiene con `prefers-reduced-motion`; no se muestran porcentajes ficticios.
- El asistente presenta la consulta de inmediato y comunica por SSE las fases reales de análisis, llamadas MCP y redacción. Kimi descubre herramientas mediante `tools/list` y el servidor ejecuta `tools/call` sobre una sesión MCP oficial en memoria cuyo principal es la cuenta autenticada. Las respuestas usan Markdown seguro sin HTML crudo; cada referencia se muestra como “Fuente n”, abre su evidencia y el detalle persistido enumera nombres MCP y fuentes con lenguaje comprensible. Durante el envío, un ancla inferior conserva el final del hilo visible incluso al reconciliar el mensaje provisional con el historial persistido.

## Movimiento

- TanStack Router habilita `defaultViewTransition` solo cuando cambia la ruta; los cambios exclusivos de parámetros de búsqueda se excluyen.
- Un único `RouteReveal` reutilizable usa GSAP y `useGSAP` con alcance local, limpieza automática y `expo.out`. El contenido es visible por defecto.
- La navegación entre el renglón Pokédex y la ficha usa una transición de vista compartida y bidireccional: la ilustración, el número, el nombre y los tipos viajan entre lista y detalle durante 600 ms. Los nombres fijos `pokemon-artwork`, `pokemon-number`, `pokemon-name` y `pokemon-types` se asignan únicamente al Pokémon involucrado antes de capturar el estado anterior y se mantienen hasta que `activeViewTransition.finished` completa la animación, evitando que los elementos reales aparezcan prematuramente en su posición final. Al abrir desde el catálogo, la ficha alinea el desplazamiento en un efecto de disposición antes de que el navegador capture el estado nuevo y desactiva el reinicio tardío del enlace, para que la instantánea y los elementos reales compartan coordenadas. Los pseudo-elementos conservan su composición y dimensionado nativos; lista y ficha precargan sus datos en los cargadores de ruta.
- La estructura persistente no participa del movimiento compartido y `RouteReveal` cede el control durante `pokemon-detail`, evitando que la barra lateral, el asistente flotante o la página compitan con la ilustración.
- Las transiciones son breves, orientadas a la tarea y no bloquean interacción. `prefers-reduced-motion` evita por completo la ejecución GSAP y elimina las animaciones de transiciones de vista.
- El indicador de pensamiento usa tres puntos discretos y tiempo transcurrido mientras la solicitud está activa; `prefers-reduced-motion` conserva el estado textual y detiene el movimiento de los puntos.

## Lenguaje

Los textos visibles usan español neutral, claro y profesional. Los nombres oficiales de Pokémon, tipos y APIs pueden conservar su forma técnica cuando evita ambigüedad.
