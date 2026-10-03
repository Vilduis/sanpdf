# Historial de cambios

## Sin publicar

- Celdas combinadas en tablas: `colSpan` y `rowSpan` en `{ text, style, colSpan, rowSpan }`.
- `headerRow()` añade filas de cabecera para agrupar columnas.
- Las filas unidas por `rowSpan` se mantienen juntas al paginar.
- Toda la documentación está ahora en el README; se elimina la carpeta `docs/`.
- La «API de bajo nivel» pasa a llamarse «API personalizada».

## 1.0.2

- Indicada la versión mínima de Node.js (18) en `engines` y en el README.
- Eliminado `devEngines`, que impedía usar `npm` dentro del repositorio.
- Añadida al README una sección de desarrollo.

## 1.0.1

- Corregidos los enlaces del README para abrir las guías, los ejemplos y la licencia
  en GitHub, evitando la vista de texto plano al navegar desde npm.io.

## 1.0.0

Versión inicial estable.

- Motor PDF propio sin dependencias de ejecución, con API ESM y tipos TypeScript.
- Composición de texto, filas, columnas y tablas con paginación automática.
- Imágenes JPEG/PNG, códigos QR, enlaces, marcadores y estilos mezclados.
- API por coordenadas, medición de texto y flujo de párrafos entre páginas.
