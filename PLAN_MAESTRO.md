# Plan maestro: Control del Taller y Producción (V&V Grafic)

Oct 16, 2026 · @ROBERT

## Resumen

El Control de Impresiones, Calandrado y Corte Láser actual funciona sobre una planilla de Google Sheets, pero ya tocó su techo: tarda entre 4 y 6 segundos por cada clic (borrando a veces el perfil o la tela que el operario acaba de elegir), escribe los metros restantes a mano fila por fila, desarma los trabajos anidados cuando llegan al corte láser, oculta las notas y en la PC desborda la pantalla obligando a achicar el zoom.

Este plan lleva al Control del Taller **exactamente la misma forma de trabajo del ERP**:
1. **Primero en pruebas, sin tocar el taller (Etapa 0):** Todo se arma usando la **base de pruebas de Supabase (`kkvzzheccniclfwqzivu`)** con el cartel visible `"BASE DE PRUEBAS"`. La planilla actual del taller no se toca hasta que todo esté probado y aprobado por vos.
2. **Cada cosa se anota en un solo lugar:** Un cliente, un rollo, una impresión, un calandrado, un corte láser, una falla, un mensaje del chat o una tirada de DTF se guarda en un único lugar mediante una sola función de la base.
3. **Los metros restantes y saldos no se escriben a mano, se calculan solos:** El stock de un rollo de papel, de film DTF o de tela sale de vistas que suman y restan los movimientos. Si editás, agregás o borrás cualquier fila en cualquier momento, todos los números cambian solos al instante.
4. **Google Sheets queda como espejo de respaldo:** La pantalla del operario responde en milisegundos contra Supabase y, en segundo plano, el sistema copia cada registro a la planilla de Google Sheets para que sigas teniendo tu backup.

---

## Reglas de oro del proyecto (alineadas con `AGENTS.md` del ERP)

- **Idioma simple y directo:** Todo en español claro. Antes de modificar cualquier cosa, explico qué voy a hacer y espero tu OK.
- **Cuidado de los créditos de Netlify:** Prohibido publicar a producción a mano (`netlify deploy --prod` ni scripts `.bat`), porque cada publicación gasta 15 de los 1.000 créditos mensuales. Se prueba localmente o en vistas previas de rama (que no gastan) y recién se une a `main` cuando juntamos varios cambios y me das el OK.
- **Conexión única (`src/config/conexion.js`):**
  - En pruebas / PC local / vista previa: conecta a la base de pruebas **`kkvzzheccniclfwqzivu`** y muestra el cartel **"BASE DE PRUEBAS"**.
  - En producción: conecta a la base real **`rqgzirimgpyvfhzbfoig`**.
- **Diseño visual unificado (`--vg-*` Cobalt Enterprise):** Prohibido escribir colores fijos en el código. Todo usa las variables de marca `--vg-*` para que el sistema sea limpio, adaptable a otros talleres y fácil de usar en celulares, tablets y PC.
- **Pensado para otros talleres:** Toda tabla nueva lleva `empresa_id`, y los cambios de base se guardan numerados en `supabase/migrations/` con su archivo para volver atrás.

---

## Principio rector: cada cosa se anota en un solo lugar

| Hecho | Único lugar donde se anota | Quién lo ve (sin copiarlo) |
| --- | --- | --- |
| Una persona (cliente o proveedor) | Contactos (`v3_clientes`) | Impresión, DTF, Calandrado, Láser, Rollos de tela, Cuenta corriente ERP |
| Un trabajo general | Trabajos (`v3_trabajos`) | Kanban del ERP, historial del cliente, seguimiento de producción |
| Un archivo de diseño en Drive | Cola Drive (`prod_archivos_drive`) | Impresión Sublimación, Impresión DTF, Buscador universal |
| Una tirada impresa (1 o varios archivos anidados) | Lotes de producción (`prod_lotes` con su código de grupo) | Impresión, Calandrado, Corte Láser y DTF (viajan siempre juntos) |
| Papel o Film DTF que entra, se imprime o se corta | Movimientos de bobina (`prod_bobinas_movimientos`) | Metros restantes del rollo en pantalla, Sobrantes, Stock del ERP |
| Rollo de tela (propio o de un cliente) | Movimientos de tela (`prod_telas_movimientos`) | Previsión de telas en Calandrado, Stock de rollos por cliente, ERP |
| Tinta consumida (Sublimación o DTF) | Consumo por rendimiento / reporte de FlexiPRINT | Costos, Stock de tinta (`v3_stock_movimientos`), Calibrador de rendimiento |
| Una falla o merma en máquina | Fallas y reposiciones (`prod_fallas` + `v3_bitacora`) | Alerta bloqueante en Impresión (repite con Prioridad Máxima), Métricas |
| Un mensaje, `@mención`, `#trabajo` o foto | Chat y notas (`prod_chat_mensajes`) | Chat interno en celular/PC y columna de Notas de ese trabajo en todas las áreas |
| Lo que se cobra o se debe en DTF | Comprobantes y Caja (`v3_comprobantes` / `v3_movimientos_caja`) | Módulo DTF, Cuenta corriente del cliente, Tesorería y Dashboard del ERP |

---

## Qué vamos a corregir y mejorar en las pantallas del taller

### 1. Control total: Editar, Eliminar y Agregar en todo momento
- En **todas** las tablas, colas e historiales (Impresión, Calandrado, Corte Láser, DTF, Rollos, Sobrantes, Telas, Perfiles, Fallas y Prendas) vas a poder **editar cualquier dato, eliminar una fila o agregar un registro manual en el momento que quieras**.
- Como los metros restantes del rollo y las métricas se calculan solos con vistas, apenas editás o borrás una fila, todos los números del rollo y del día se corrigen solos al instante y se actualiza la Google Sheet espejo.

### 2. Interfaz cómoda para los operarios (Celular, Tablet y PC)
- **Modo Kiosko y ventana de Montar Rollo sin desbordes:** La ventana nunca va a pasar del alto de la pantalla. El botón de **Cerrar (`❌`)** arriba y los botones de **Finalizar / Pausar / Falla** abajo quedan siempre fijos a la vista. No vas a tener que achicar más el porcentaje de zoom en la PC para poder salir o finalizar.
- **Ruta de producción en botones grandes (sin lista desplegable):**
  En lugar del listado actual, van 3 botones directos de un solo toque:
  `[ 🔥 1. Solo Calandrado ]` · `[ 🔥+⚡ 2. Calandrado + Láser ]` · `[ 🖨️ 3. Solo Impresión ]`
- **Botones de sugerencia (Tela, Perfil y Color) que cambian rápido:**
  - **El 1er lugar siempre lo tiene el último que acabás de usar.**
  - Los siguientes lugares se ordenan por los más usados en los últimos 20-30 trabajos (corrigiendo el problema actual que suma todo el historial viejo y no cambia nunca).
- **Que nunca se borre el Perfil ni la Tela mientras estás cargando:**
  - Hoy, cuando la app sincroniza en segundo plano, pisa el formulario con valores vacíos si tardás unos segundos en apretar Procesar. En el sistema nuevo, lo que el operario elija o escriba en pantalla no se toca ni se borra hasta que confirme la impresión.

### 3. Lectura inteligente de los nombres de archivos y carpetas
Cuando el operario marca **uno o varios archivos** en la fila de impresión, el sistema lee el nombre de los archivos y de su carpeta para completar solo:
- **Perfil** (ej. `V-V 3P`, `V-V 4P`).
- **Tela** (ej. `SET`, `CEY`, `JERSEY`, `MORLEY`, `WAFLE`, `SPUN`).
- **Rollos de tela** (ej. `ROLLO 1`, `ROLLOS 2 Y 3`, `50 ROLLOS`).
- **Color de la tela** (ej. `NATURAL`, `BLANCO`, `NEGRO`, `CRUDO`).
- **Ruta** (si dice `CORTAR` o `LASER`, marca `Calandrado + Láser`).
- **Regla clave:** No rellena con datos viejos de meses anteriores del cliente. Si el archivo actual **no dice** alguno de esos datos en su nombre, lo deja **en blanco** para que lo toques manualmente.

### 4. Trabajos anidados unidos también en Corte Láser
- Cuando imprimís varios archivos anidados juntos, reciben un mismo código de grupo.
- Así como se ven juntos en Impresión y en Calandrado, **en Corte Láser también van a aparecer anidados en un solo bloque**, mostrando los archivos que lo forman y el total de metros para poder marcarlos como cortados de una sola vez.

### 5. Datos visibles, Fechas, Filtros y Buscador Universal
- **Metros sumados en cada bloque de Impresión:** Cada bloque de rollo o corte de papel muestra arriba la suma acumulada de metros a medida que vas agregando impresiones.
- **Columna de Ruta de Producción visible en Impresión:** Para ver de un vistazo qué destino tiene cada trabajo impreso y cambiarlo si hace falta.
- **Notas y Fallas a la vista en todas las filas:** Toda anotación o falla hecha en Impresión, Calandrado o Láser se muestra resaltada directamente en la fila del trabajo (tanto en una columna como con un botón rápido para ver/agregar notas).
- **Fecha manual respetada en Calandrado:** Se corrige el error actual donde al finalizar un calandrado poniendo otra fecha igual lo guardaba con la fecha de hoy.
- **Ver Ayer, Semana Anterior o cualquier rango de fechas en todos los módulos:** En Impresión, Calandrado, Láser, DTF y Métricas vas a tener botones rápidos (`Hoy`, `Ayer`, `Esta Semana`, `Semana Anterior`, `Este Mes`) y un selector `Desde - Hasta` para ver cuánto se produjo en el intervalo que quieras.
- **Buscador rápido en todos lados:** Una caja de búsqueda en cada módulo (y un buscador general arriba) donde escribís cualquier palabra o número (nombre de cliente, archivo, perfil, tela, rollo o metros) y te filtra al instante todo lo que coincida.

---

## Nuevo Módulo DTF + Automatización con FlexiPRINT

1. **Rollos de Film DTF:** Siempre de **60 cm de ancho × 100 m**, registrando **Marca/Fabricante** y **Perfil** para medir qué marca rinde mejor y cuál tiene menos fallas.
2. **Precios escalonados automáticos y cuenta por cliente:**
   - `1 a 9 m`: **$9.000 / m** · `10 a 49 m`: **$8.500 / m** · `50 a 99 m`: **$8.000 / m** · `100 a 499 m`: **$7.500 / m** · `+500 m`: **$6.500 / m**.
   - Se enlaza directo con `v3_clientes`, `v3_comprobantes` y `v3_movimientos_caja` del ERP para llevar señas, pagos al retirar y saldo pendiente.
3. **Anidados de varios clientes:** Separa los **metros que se le cobran a cada cliente** de los **metros físicos que gasta el rollo** en la tirada anidada del RIP.
4. **Reposiciones y Muestras a $0:**
   - Si el nombre tiene `(repo)`, `(reposición)` o `(muestra)`, descuenta el film del rollo pero pone el cobro en **$0** (separando en las métricas cuántos metros del rollo fueron Venta, cuántos Reposición por falla y cuántos Muestras).
   - Si se manda un archivo con el mismo nombre que otro ya impreso antes, el sistema avisa y pregunta: *¿Es reposición por falla ($0) o el cliente pidió copias nuevas (cobrar)?*
5. **Doble lectura de medidas (por Nombre y por los DPI reales del archivo):**
   - Lee el nombre `Robert mata (dtf)(26-09-26) 01 2.5 x 10 (25 mts)`.
   - Lee además la cabecera interna del archivo (los primeros 1 KB) para saber los píxeles y los **DPI reales con los que fue guardado (300, 250, 150, etc.)** y calcula los metros físicos reales. Si no coinciden con lo que dice el nombre, te avisa antes de imprimir.
6. **Monitor de FlexiPRINT (Watchdog):**
   - Espera a que el archivo termine de guardarse bien en la PC, lee del FlexiPRINT cuándo se ripea, qué perfil usó, qué archivos se anidaron, cuántos metros reales suman y cuánto consumió de tinta, y al imprimirse mueve los archivos a la carpeta `0001 IMPRESOS` correcta en Drive.

---

## Chat Interno entre Áreas (`@Menciones`, `#Trabajos` y Fotos en Celular)

Pensado para que en el celular sea tan práctico como WhatsApp, pero atado al trabajo del taller:

- **Filtros por sector con un toque:** `General`, `Impresión`, `Calandrado`, `Corte Láser`, `DTF` y `🔔 Mis Menciones (@Yo)`.
- **Hablar sobre un trabajo específico (`#Trabajo`):**
  - Tocando el botón **`💬`** en la fila de cualquier trabajo (o escribiendo `#` en el chat), el mensaje lleva pegada la tarjeta de ese trabajo con su miniatura, cliente y rollo.
  - Todo mensaje o foto que se mande sobre un trabajo queda guardado también en las **Notas** de esa orden para que lo vean en Impresión, Calandrado y Láser.
- **Arrobar a alguien del equipo (`@Nombre`):**
  - Escribiendo `@` elegís a la persona (`@Robert`, `@Calandra`, `@Laser`, etc.) y le suena una alerta en su celular o pantalla de máquina.
- **Adjuntar fotos directo con la cámara:**
  - Botón `📷` que abre la cámara del celular, achica el peso de la foto automáticamente para que suba en menos de medio segundo y la muestra en el chat y en la ficha del trabajo.

---

## Hoja de ruta paso a paso

| Etapa | Qué hacemos | Punto de control para avanzar |
| --- | --- | --- |
| **Etapa 0 · Preparación** | Crear las tablas de producción (`prod_*` con `empresa_id`) en la **base de pruebas (`kkvzzheccniclfwqzivu`)**, conectar una copia de la app mediante `conexion.js` (con cartel `"BASE DE PRUEBAS"`) y armar el puente de prueba con Google Sheets y Drive | La app de prueba abre, lee y guarda en Supabase de pruebas sin tocar el sistema actual del taller |
| **Etapa 1 · Pantallas de Planta y Arreglos Visuales** | Kioskos cómodos en PC y celular (sin desborde), botones de Ruta, botones de Tela/Perfil/Color con el último usado en 1º lugar, anidados unidos en Láser, fecha manual en Calandra, que no se borre el Perfil/Tela y columna de Ruta y Notas visibles | Recorrido completo de Impresión → Calandrado → Corte Láser probado en PC y celular sin fallas |
| **Etapa 2 · Una Sola Fuente, Buscador, Filtros y Edición Total** | Vistas automáticas de metros por bloque y por rollo, poder editar/borrar/agregar cualquier fila en todo el sistema, buscador por cualquier palabra/número, filtros de Ayer/Semana Anterior/Fechas y lectura de Perfil/Rollo/Color/Tela en los nombres de archivos | Editar o borrar un trabajo recalcula solo el rollo; consulta de cuadre con cero diferencias |
| **Etapa 3 · Módulo DTF y Monitor FlexiPRINT** | Pantalla de rollos y cola DTF, doble lectura de medidas (nombre y DPI real), precios por escala, reposiciones y muestras a $0, conexión con cuenta corriente de clientes y agente lector de FlexiPRINT | Tirada DTF anidada de varios clientes descuenta el rollo y carga el saldo exacto a cada cliente |
| **Etapa 4 · Chat Interno y Fotos** | Burbuja y pestaña de chat móvil/PC, menciones `@persona`, vínculo `#trabajo`, subida de fotos desde cámara e integración con las notas de cada orden | Mensaje con foto y `@mención` enviado desde celular llega en tiempo real y queda en el trabajo |
| **Etapa 5 · Unión con el ERP, Paso a Base Real y Limpieza** | Aplicar las migraciones en la **base real (`rqgzirimgpyvfhzbfoig`)**, migrar el historial de tu Google Sheet actual, conectar consumos de tinta/papel/tela con el stock del ERP y pasar el taller al sistema nuevo | Una semana de uso con números cuadrados al 100 % en Supabase, el ERP y la Sheet de respaldo |
