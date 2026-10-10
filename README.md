# Rutas Sureste

Sistema de planeación de rutas carreteras, cálculo de kilometraje/combustible para Excel y gestión geoespacial de tiendas para la región **Sureste de México** (**Chiapas, Tabasco, Campeche, Yucatán, Quintana Roo, Veracruz y Oaxaca**).

Diseñado bajo principios **Minimalism & Swiss Style** con componentes **React 19**, **Tailwind CSS v4**, **shadcn/ui** y **Google Maps Platform** (`@vis.gl/react-google-maps` + **Routes API v2**), optimizado para operar **100% dentro del nivel gratuito (Free Tier)** mediante caché persistente en disco y optimización matemática local.

---

## Tabla de Contenidos

1. [Características Principales](#1-características-principales)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [Instalación y Puesta en Marcha](#4-instalación-y-puesta-en-marcha)
5. [Funcionamiento de los Módulos](#5-funcionamiento-de-los-módulos)
6. [Estrategia de Caché y Costo $0 en Google Cloud](#6-estrategia-de-caché-y-costo-0-en-google-cloud)
7. [Atajos de Teclado](#7-atajos-de-teclado)
8. [Documentación Técnica Detallada](#8-documentación-técnica-detallada)

---

## 1. Características Principales

- **Constructor de Rutas en Tiempo Real (`Ruta`)**:
  - Buscador inteligente con soporte de alias regionales del Sureste (`vhsa` → Villahermosa, `mid` → Mérida, `cun` → Cancún, `coita` → Ocozocoautla, `sancris` → San Cristóbal, `tgza` → Tuxtla, etc.).
  - Sugerencias dinámicas de tiendas **más cercanas** al último punto agregado o filtradas por corredor/estado.
  - Inserción por **lote** pegando listas directamente desde Excel o WhatsApp.
  - Soporte para **desvíos temporales** (hoteles, casetas, proveedores) mediante coordenadas, enlaces de Google Maps o clic derecho directamente sobre el mapa.
  - Reordenamiento por arrastrar y soltar (*Drag & Drop*) y **optimización automática de orden (`Alt + O`)** mediante algoritmo *Vecino más cercano + 2-Opt*.
  - Salida de un clic (**`Ctrl + Enter`**) formateada exactamente con tabuladores o CSV para pegar directo en **Microsoft Excel / Google Sheets**, más resumen listo para compartir por **WhatsApp**.

- **Catálogo Geoespacial y Ajuste Satelital (`Catálogo`)**:
  - Alta, edición, baja y filtrado de tiendas por estado del Sureste (`Chiapas`, `Tabasco`, `Campeche`, `Yucatán`, `Quintana Roo`, `Veracruz`, `Oaxaca`) o corredor carretero.
  - Ajuste milimétrico de coordenadas arrastrando el pin sobre vista **Satélite Híbrida** o pegando enlaces cortos de Google Maps (`maps.app.goo.gl/...`) y ubicaciones de WhatsApp.
  - Comparativa en tiempo real de desplazamiento en metros y rumbo cardinal respecto a la coordenada anterior, con enlaces directos a **Street View**.
  - Respaldos automáticos rotativos (`data/backups/`) antes de cada modificación.

- **Historial y Analítica Operativa (`Historial`)**:
  - Registro histórico de rutas por fecha con fecha seleccionable mediante **Date Picker (`Popover + Calendar`)**.
  - Indicadores acumulados de rutas realizadas, kilómetros recorridos, gasto estimado de combustible y tiendas más visitadas.
  - Reutilización de cualquier ruta histórica con un clic (*"Usar hoy"* o *"Editar"*).

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js LTS (*Krypton*) | `v24.19.0` | Ejecución nativa ESM, servidor HTTP y lectura de `.env` |
| **Frontend** | React + React DOM | `19.3.0` | Interfaz reactiva de alta densidad |
| **Bundler / Dev** | Vite | `8.3.2` | Compilación instantánea + middleware `/api/*` integrado |
| **Estilos** | Tailwind CSS + `@tailwindcss/vite` | `4.3.3` | Motor CSS v4 nativo en Vite (sin PostCSS) |
| **Componentes UI** | shadcn/ui + `@radix-ui/*` | Última | `Dialog`, `Select`, `Tabs`, `Popover`, `Calendar`, `Switch`, `Tooltip` |
| **Iconografía** | `@phosphor-icons/react` | `2.1.10` | Sistema de iconos vectoriales (`duotone`, `bold`, `fill`, `regular`) |
| **Fechas** | `date-fns` + `react-day-picker` | `4.4.0` / `10.0.2` | Selector de fecha localizado a español (`es`) |
| **Mapas Web** | `@vis.gl/react-google-maps` | `1.10.1` | Componentes oficiales de Google Maps JavaScript API (`AdvancedMarker`) |
| **Ruteo Carretero** | Google Routes API v2 | REST v2 | Cálculo real de distancia carretera, duración y polilíneas codificadas |

---

## 3. Estructura del Proyecto

El repositorio está organizado en 3 capas claramente separadas (**Frontend en `src/`**, **Backend en `server/`** y **Datos en `data/`**):

```text
ruteo-chiapas/
├── src/                                # CAPA FRONTEND (React 19 + Tailwind v4 + shadcn/ui)
│   ├── components/
│   │   ├── ui/                         # Primitivas reutilizables shadcn/ui
│   │   │   ├── badge.jsx               # Etiquetas de estado y contadores
│   │   │   ├── brand-logo.jsx          # Isotipo vectorial de Rutas Sureste
│   │   │   ├── button.jsx              # Botones con variantes CVA
│   │   │   ├── calendar.jsx            # Calendario React DayPicker v10 en español
│   │   │   ├── card.jsx                # Contenedores de superficie y paneles
│   │   │   ├── date-picker.jsx         # Selector de fecha (Popover + Calendar + Presets)
│   │   │   ├── dialog.jsx              # Modales accesibles (Radix Dialog)
│   │   │   ├── input.jsx               # Campos de texto con tamaños sm/default/lg
│   │   │   ├── kbd.jsx                 # Indicadores visuales de atajos de teclado
│   │   │   ├── label.jsx               # Etiquetas de formulario
│   │   │   ├── popover.jsx             # Contenedor flotante (Radix Popover)
│   │   │   ├── select.jsx              # Selectores desplegables (Radix Select)
│   │   │   ├── separator.jsx           # Divisores horizontales y verticales
│   │   │   ├── switch.jsx              # Interruptores booleanos (Radix Switch)
│   │   │   ├── table.jsx               # Tablas de datos para vista previa de Excel
│   │   │   ├── tabs.jsx                # Pestañas de navegación principal (Radix Tabs)
│   │   │   ├── textarea.jsx            # Área de texto para pegado por lotes
│   │   │   ├── tooltip.jsx             # Tooltips con soporte de atajo de teclado
│   │   │   └── typography.jsx          # Componentes tipográficos estandarizados
│   │   ├── RouteBuilderTab.jsx         # Pestaña 1: Armado de ruta, métricas y salida Excel
│   │   ├── CoordinateAuditTab.jsx      # Pestaña 2: Catálogo multi-estado y ajuste satelital
│   │   ├── HistoryAnalyticsTab.jsx     # Pestaña 3: Historial de rutas y KPIs acumulados
│   │   └── MapCanvas.jsx               # Lienzo de Google Maps, pines y polilíneas
│   ├── lib/
│   │   ├── brand.js                    # Identidad de marca y catálogo de estados del Sureste
│   │   └── utils.js                    # Utilidades geográficas, alias, zonas y cliente HTTP
│   ├── App.jsx                         # Estado global, atajos de teclado y layout maestro
│   ├── main.jsx                        # Punto de montaje de React 19
│   └── index.css                       # Tema CSS (variables OKLCH/HSL dark/light) y Tailwind v4
│
├── server/                             # CAPA BACKEND (Node.js ESM nativo)
│   ├── index.js                        # Servidor HTTP de producción (pnpm start)
│   ├── api.js                          # Enrutador REST (/api/config, /tiendas, /ruta, etc.)
│   ├── distancias.js                   # Cliente Google Routes API v2 + Caché + 2-Opt local
│   ├── coords.js                       # Extractor de coordenadas desde texto y URLs acortadas
│   ├── db.js                           # Persistencia atómica de tiendas.json y respaldos
│   └── config.js                       # Carga de .env y resolución de rutas hacia /data
│
├── data/                               # CAPA DE PERSISTENCIA LOCAL (JSON)
│   ├── tiendas.json                    # Catálogo maestro de tiendas (68 iniciales + Sureste)
│   ├── historial-rutas.json            # Rutas diarias guardadas
│   ├── cache/
│   │   └── distancias.json             # Caché persistente de tramos carreteros (TTL 30 días)
│   └── backups/                        # Hasta 40 respaldos automáticos rotativos de tiendas
│
├── public/
│   └── favicon.svg                     # Favicon vectorial cartográfico
├── docs/
│   └── ARQUITECTURA.md                 # Manual técnico detallado de API, flujos y algoritmos
├── index.html                          # Punto de entrada HTML requerido por Vite
├── vite.config.js                      # Configuración de Vite 8 + plugin de API integrado
├── jsconfig.json                       # Configuración de rutas (@/*) e inteligencia del IDE
└── package.json
```

---

## 4. Instalación y Puesta en Marcha

### Requisitos previos
- **Node.js** `v22.18+` o `v24.x LTS` (recomendado).
- **pnpm** `v10+`.
- Una **API Key de Google Maps Platform** con los servicios **Maps JavaScript API** y **Routes API** habilitados.

### Paso 1: Configurar variables de entorno
Crea un archivo `.env` en la raíz del proyecto (puedes basarte en `.env.example`):

```env
GOOGLE_MAPS_API_KEY=tu_api_key_aqui
PORT=3000
```

### Paso 2: Instalar dependencias
```bash
pnpm install
```

### Paso 3: Iniciar en modo desarrollo
```bash
pnpm dev
```
- Abre **`http://localhost:5173`**.
- **Nota importante**: No necesitas abrir dos terminales. El plugin `rutasSuresteApiPlugin()` dentro de [`vite.config.js`](./vite.config.js) monta automáticamente todo el backend de `server/api.js` dentro del mismo servidor de Vite en el puerto `5173`.

### Paso 4: Compilar y ejecutar en producción
```bash
# Genera el bundle optimizado en dist/
pnpm build

# Compila y levanta el servidor de producción en http://localhost:3000
pnpm start
```

---

## 5. Funcionamiento de los Módulos

### Módulo 1: Constructor de Ruta (`src/components/RouteBuilderTab.jsx`)
1. **Selección de Fecha y Etiqueta**: Usa el componente `DatePicker` (`Popover` + `Calendar`) con accesos rápidos para *Ayer*, *Hoy* y *Mañana*.
2. **Omnibox Inteligente**:
   - Si escribes el nombre o alias de una tienda (`coita`, `vhsa`, `sancris`), filtra por coincidencia de prefijos y cercanía al último punto.
   - Si pegas varias líneas separadas por saltos de línea o comas, detecta automáticamente un **lote** y ofrece encadenarlas en un solo paso.
   - Si pegas coordenadas (`16.75, -93.11`) o un enlace de Google Maps, ofrece insertar un **desvío temporal**.
3. **Cálculo de Tramos y Tabla Excel**:
   - Cada vez que cambia la lista de paradas, `App.jsx` solicita los tramos a `POST /api/ruta`.
   - El kilometraje de cada tramo se redondea hacia arriba (`Math.ceil(metros / 1000)`) conforme al estándar operativo de reporte en Excel.
   - Al presionar **`Ctrl + Enter`**, se copia al portapapeles la tabla exacta (`ORIGEN | DESTINO | KM`) lista para pegar directamente en Excel.

### Módulo 2: Catálogo y Ajuste de Pines (`src/components/CoordinateAuditTab.jsx`)
1. **Multi-Estado para todo el Sureste**: Cada tienda puede asignarse a `Chiapas`, `Tabasco`, `Campeche`, `Yucatán`, `Quintana Roo`, `Veracruz` u `Oaxaca`.
2. **Ajuste Satelital**:
   - Puedes llegar aquí desde la pestaña *Catálogo* o haciendo clic en el icono de mira (`Crosshair`) de cualquier parada dentro de una ruta activa.
   - El mapa cambia automáticamente a modo **Satélite Híbrido (`hybrid`)** con zoom `18` sobre la tienda.
   - Puedes arrastrar el pin con el mouse, hacer clic en la ubicación exacta o pegar un link de Google Maps / WhatsApp (`Ctrl + V`).

### Módulo 3: Mapa Interactivo (`src/components/MapCanvas.jsx`)
- Renderiza las tiendas mediante `<AdvancedMarker>` de `@vis.gl/react-google-maps`.
- **Cero ruido visual**: Por defecto oculta las etiquetas de texto de las tiendas que no están en la ruta activa (mostrándolas al pasar el cursor por encima o al activar el botón **Nombres**).
- Dibuja la polilínea real de carretera (`encodedPolyline`) en azul para los tramos calculados por Google Routes API, o línea punteada cuando se usa estimación u origen/anterior en modo edición.

---

## 6. Estrategia de Caché y Costo $0 en Google Cloud

El proyecto implementa 4 candados técnicos en [`server/distancias.js`](./server/distancias.js) para nunca exceder la capa gratuita de Google Maps Platform:

1. **Caché Persistente por Coordenadas (`data/cache/distancias.json`)**:
   - Cada tramo `Origen (lat,lng) → Destino (lat,lng)` calculado se guarda en disco durante **30 días**.
   - Si mañana armas otra ruta que incluya ese mismo par de tiendas, se resuelve desde disco en **0 ms** y consume **0 llamadas** a Google.
2. **Invalidación Selectiva**:
   - Cambiar el nombre o estado de una tienda **no borra su caché**. Solo se invalidan los tramos de una tienda cuando sus coordenadas cambian más de ~1 metro.
3. **Forzado Estricto al Nivel *Essentials* (10,000 gratis/mes)**:
   - El encabezado `X-Goog-FieldMask` solicita únicamente `routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline` con `routingPreference: 'TRAFFIC_UNAWARE'`, evitando activar niveles de cobro superiores (*Pro* o *Enterprise*).
4. **Optimizador 2-Opt Local (`0` llamadas a Google)**:
   - El botón **"Optimizar orden (`Alt + O`)"** resuelve el problema del agente viajero (TSP) localmente en Node.js usando las distancias ya cacheadas y Haversine carretero, sin invocar el servicio de pago `optimizeWaypointOrder` de Google.

---

## 7. Atajos de Teclado

| Atajo | Acción | Contexto |
| :--- | :--- | :--- |
| **`/`** o **`Ctrl + K`** | Enfocar el buscador de tiendas | Global |
| **`Enter`** | Agregar primera tienda sugerida / Guardar coordenada editada | Buscador / Catálogo |
| **`Backspace`** *(con buscador vacío)* | Quitar la última parada agregada a la ruta | Pestaña Ruta |
| **`Ctrl + Enter`** | Copiar tabla de tramos lista para pegar en Excel | Pestaña Ruta |
| **`Alt + O`** | Optimizar automáticamente el orden de las paradas | Pestaña Ruta |
| **`Ctrl + S`** | Guardar ruta del día en el historial / Guardar tienda | Ruta / Catálogo |
| **`Ctrl + Z`** | Deshacer el último cambio en la ruta (hasta 60 niveles) | Pestaña Ruta |
| **`Ctrl + V`** | Pegar enlace de Google Maps / WhatsApp o lista por lote | Catálogo / Buscador |
| **`N`** | Saltar a la siguiente tienda pendiente de revisión | Pestaña Catálogo |
| **`Alt + 1 / 2 / 3`** | Cambiar entre las pestañas *Ruta*, *Catálogo* e *Historial* | Global |
| **`Clic derecho en el mapa`** | Agregar un desvío temporal en ese punto exacto | Pestaña Ruta |

---

## 8. Documentación Técnica Detallada

Para conocer a fondo los endpoints de la API interna, la estructura de los archivos JSON, los algoritmos matemáticos (Haversine, 2-Opt, decodificación de polilíneas) y las guías de despliegue en la nube, consulta:

- **[`docs/ARQUITECTURA.md`](./docs/ARQUITECTURA.md)** — Manual de Arquitectura, Endpoints REST y Algoritmos Internos.

