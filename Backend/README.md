# 🎛️ Music Uptc Backend - API & Core Logic

[![Python](https://img.shields.io/badge/Language-Python%203.11-blue?style=for-the-badge&logo=python)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Framework-Flask-000000?style=for-the-badge&logo=flask)](https://flask.palletsprojects.com/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-green?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Spotify](https://img.shields.io/badge/API-Spotify-1DB954?style=for-the-badge&logo=spotify)](https://developer.spotify.com/)
[![License](https://img.shields.io/badge/License-GPL%203.0-brightgreen?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0.html)

## 📡 Descripción General

Este es el **motor lógico** detrás de la plataforma "Música Democrática". Se encarga de la orquestación entre la votación de los usuarios, la base de datos en tiempo real y la reproducción musical en Spotify.

El backend gestiona la lógica de negocio crítica: desde el cálculo de votos y rankings hasta el "polling" inteligente del estado de reproducción para mantener todo sincronizado.

## ✨ Arquitectura y Características

### 🔁 Sincronización con Spotify (Intelligent Polling)
El sistema implementa un monitor de estado (background thread) que consulta constantemente la API de Spotify para:
* Detectar qué canción está sonando en tiempo real.
* Identificar cambios de pista para actualizar el historial.
* Gestionar tokens de acceso y refresco (OAuth 2.0) automáticamente.
* **Cache Inteligente**: Utiliza variables en memoria para reducir latencia y evitar límites de rate-limiting de la API externa.

### 🗳️ Motor de Votación y Ranking
* **Algoritmos de Ranking**: Cálculo de posiciones basado en votos netos (Likes - Dislikes).
* **Gestión de Historial**: Archivo automático de canciones reproducidas para evitar repeticiones inmediatas.
* **Prevención de Fraude**: Validación de huellas digitales (Fingerprints) e IPs para limitar votos.

### 🛡️ Seguridad y Autenticación
* **JWT (JSON Web Tokens)**: Protección de rutas administrativas.
* **Verificación de Origen**: Middleware CORS configurado estrictamente para dominios autorizados.
* **Variables de Entorno**: Gestión segura de credenciales mediante `python-dotenv`.

### ⚡ Rendimiento
* **Redis Cloud**: (Opcional) Integración preparada para caché distribuida.
* **Gunicorn**: Servidor WSGI de producción para manejo concurrente de peticiones.

## 🛠️ Tecnologías Clave

* **Flask**: Framework ligero para la API RESTful.
* **Spotipy**: Cliente robusto para la Web API de Spotify.
* **Supabase-py**: Cliente oficial para interacción con PostgreSQL/Supabase.
* **Threading**: Manejo de procesos en segundo plano para monitoreo continuo.

## 🔧 Configuración del Entorno (.env)

El sistema requiere las siguientes variables de entorno para funcionar:

```env
# Spotify Configuration
SPOTIFY_CLIENT_ID=tucLientId
SPOTIFY_CLIENT_SECRET=tuSecret
SPOTIFY_REDIRECT_URI=https://tu-app.com/api/spotify/callback

# Supabase Configuration
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-anon-key-o-service-role

# Security
JWT_SECRET=tu-secreto-super-seguro

# Redis (Opcional)
# REDIS_URL=redis://...
```

## 🚀 Instalación y Ejecución

### Requisitos
* Python 3.9+
* Cuenta de desarrollador en Spotify
* Proyecto en Supabase

### Pasos

1.  **Clonar y preparar entorno**:
    ```bash
    git clone https://github.com/SebastianVega4/Music_Uptc_Sogamoso_Back.git
    cd Music_Uptc_Sogamoso_Back
    python -m venv .venv
    # Windows
    .venv\Scripts\activate
    # Linux/Mac
    source .venv/bin/activate
    ```

2.  **Instalar dependencias**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Ejecutar en Desarrollo**:
    ```bash
    flask run --debug
    ```
    El servidor iniciará en `http://localhost:5000`.

4.  **Despliegue (Production-ready)**:
    Utiliza `gunicorn` para entornos productivos (compatible con Vercel/Render):
    ```bash
    gunicorn app:app
    ```

---

## 👨‍🎓 Autor

**Sebastián Vega** - *Ingeniería de Sistemas UPTC*

🔗 [LinkedIn](https://www.linkedin.com/in/johan-sebastian-vega-ruiz-b1292011b/) | 🔗 [GitHub](https://github.com/SebastianVega4)

---

## 📜 Licencia

Bajo la Licencia **GPL 3.0**.