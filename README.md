# Turnos App
 
Sistema de gestión de turnos omnicanal en tiempo real. Permite a los clientes sacar turnos, a los asesores atenderlos desde su módulo y al administrador configurar los servicios disponibles. Incluye una pantalla de visualización para mostrar el turno en llamada.
 
---
 
## Requisitos
 
- [Node.js](https://nodejs.org/) versión 18 o superior
---
 
## Instalación
 
1. Clona o descarga el repositorio y entra a la carpeta del proyecto:
```bash
cd turnos-app-main
```
 
2. Instala las dependencias (Express y Socket.IO):
```bash
npm install
```
 
---
 
## Iniciar el servidor
 
```bash
npm start
```
 
El servidor quedará corriendo en `http://localhost:3000`
 
> Si quieres que el servidor se reinicie automáticamente al hacer cambios en el código, usa:
> ```bash
> npm run dev
> ```
> (Requiere `nodemon`, que ya viene incluido como dependencia de desarrollo.)
 
---
 
## Vistas disponibles
 
| URL | Descripción |
|---|---|
| `http://localhost:3000/` | Pantalla principal |
| `http://localhost:3000/cliente` | Vista del cliente para sacar turno |
| `http://localhost:3000/asesor` | Vista del asesor para atender turnos |
| `http://localhost:3000/admin` | Panel de administración |
| `http://localhost:3000/pantalla` | Pantalla de visualización (TV/monitor) |
 
---
 
## Credenciales por defecto
 
**Asesores:**
 
| Nombre | Módulo | Contraseña |
|---|---|---|
| Ana García | 1 | 1234 |
| Luis Martínez | 2 | 1234 |
| María López | 3 | 1234 |
 
**Administrador:**
 
| Email | Contraseña |
|---|---|
| admin@turnos.com | admin123 |
 
---
 
## Tecnologías usadas
 
- **Node.js** — entorno de ejecución
- **Express** — servidor web y API REST
- **Socket.IO** — comunicación en tiempo real entre vistas
