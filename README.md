# TenderoPro (Local) — Node + SQLite

Breve guía para instalar, ejecutar y operar la versión local de TenderoPro.

Instalación

- Clona el repositorio o descarga los archivos en una máquina con Node.js (16+ recomendado).
- En la carpeta del proyecto ejecuta:

```bash
npm install
```

Variables de entorno

- Crea un archivo `.env` en la raíz con al menos:

```
PORT=3001
JWT_SECRET=tu_secreto_aqui
NODE_ENV=production
```

- Nota: **NO** subas `.env` a un repo público. `.gitignore` ya incluye `.env`.

Arrancar

- Para desarrollo:

```bash
npm start
```

- El servidor por defecto escucha en `http://localhost:3001`.

Acceso desde otra máquina en la LAN

- Averigua la IP del equipo que ejecuta el servidor (por ejemplo `192.168.1.6`).
- Desde el teléfono/otro PC abre `http://<IP>:3001` (ej: `http://192.168.1.6:3001`).
- Asegúrate de que la red no esté bloqueando el puerto y que el servidor se haya iniciado.

Instalación PWA (móvil)

- Abre la web en el navegador móvil.
- Usa el método del navegador para "Instalar" o "Agregar a pantalla de inicio".
- La app usa `manifest.json` y `sw.js` para soporte offline básico.

Backup

- Desde la API autenticada: `GET /api/backup` devuelve un payload JSON con todo el estado.
- Puedes descargarlo y guardarlo como copia fuera del dispositivo.

Restore

- El endpoint `POST /api/backup/restore` acepta el payload devuelto por `/api/backup`.
- Se realiza una copia de seguridad segura del archivo SQLite antes de restaurar.
- Uso típico (desde la máquina que ejecuta la API): autenticar con admin y POST al endpoint.

Cambio de contraseña

- Inicia sesión con `POST /api/auth/login`.
- Cambia la contraseña con `POST /api/auth/change-password` (requiere token).

Solución de problemas

- Si el puerto está en uso, mata el proceso Node que lo ocupa o cambia `PORT` en `.env`.
- Si la API devuelve errores al restaurar, revisa que el payload provenga de `/api/backup` de la misma versión.
- Revisa los logs en la consola donde corre `node server.js`.

Estado y notas

- Esta copia local usa SQLite (`data/tenderopro.db`). Las copias de seguridad automáticas se guardan en `data/backups`.
- No compartas el archivo `.env` ni el contenido de `data/tenderopro.db` sin quitar secretos.

Contacto

- Si necesitas que revise algo específico, indícalo en la tarea correspondiente.

# Apartados de tienda

Aplicación web simple para controlar apartados, abonos y clientes.

## Publicación rápida

Esta web puede subirse a servicios gratuitos como:

- GitHub Pages
- Netlify
- Vercel

Solo necesitas publicar la carpeta completa de este proyecto.

## Abrirla desde el celular

1. Ejecuta el archivo start_server.bat.
2. En la ventana aparecerá una dirección como http://192.168.1.20:8000.
3. En tu celular entra a esa misma dirección, usando la misma red Wi‑Fi.
4. Si tu celular no carga la página, revisa que el firewall de Windows permita el puerto 8000.
