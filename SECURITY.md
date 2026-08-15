# Política de seguridad

## Versiones con soporte

Este repositorio mantiene una única línea activa: la rama `main`. Las correcciones de seguridad se aplican sobre esa rama y se incluyen en el siguiente despliegue.

## Reportar una vulnerabilidad

No publiques credenciales, datos personales, rutas de explotación ni pruebas de concepto sensibles en un issue público.

1. Usa la opción **Report a vulnerability** de la pestaña **Security** del repositorio remoto.
2. Describe el impacto, los pasos mínimos para reproducirlo y la versión o revisión afectada.
3. Indica si la prueba accedió a datos reales. No adjuntes secretos ni copias de información personal.

Si el repositorio remoto todavía no tiene habilitados los avisos privados de seguridad, la persona responsable debe activarlos antes de publicar el proyecto.

## Alcance

Se consideran dentro de alcance la autenticación, el aislamiento por cuenta, MongoDB, el endpoint MCP, el procesamiento de imágenes, las integraciones con PokéAPI y Kimi, y la exposición accidental de secretos.

Las claves filtradas deben revocarse y rotarse de inmediato. Eliminar una clave del historial de Git no invalida una credencial que ya fue expuesta.
