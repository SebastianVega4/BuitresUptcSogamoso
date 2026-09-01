# 🎵 Música Democrática - Music Uptc Sogamoso

[![Angular](https://img.shields.io/badge/Built%20with-Angular%2016-red?style=for-the-badge&logo=angular)](https://angular.io/)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-green?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Spotify](https://img.shields.io/badge/Integration-Spotify%20API-1DB954?style=for-the-badge&logo=spotify)](https://developer.spotify.com/)
[![Status](https://img.shields.io/badge/Status-En%20Desarrollo-blue?style=for-the-badge)]()
[![License](https://img.shields.io/badge/License-GPL%203.0-brightgreen?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0.html)

## 🎯 Descripción General

**Música Democrática** es una plataforma web desarrollada para transformar la experiencia auditiva en espacios compartidos. Permite a los usuarios de la **UPTC Sogamoso** (o cualquier comunidad) proponer y votar por canciones en tiempo real, asegurando que lo que suena es lo que la mayoría desea escuchar.

El proyecto combina una interfaz moderna en **Angular** con la potencia de **Supabase** y la **API de Spotify** para ofrecer una experiencia fluida, anónima y democrática.

## 🦅 Comunidad Buitres - Ecosistema Social

Más allá de la música, la plataforma incorpora un ecosistema social único llamado **"Buitres"**, diseñado para la interacción anónima y la libre expresión con mecanismos de autorregulación.

### � Notas Musicales y de Texto (Historias)
Inspirado en *Instagram Notes*, los usuarios pueden dejar mensajes efímeros en los perfiles de otros:
* **Notas Musicales**: Dedica una canción directamente desde **Spotify** (con vista previa de 30s).
* **Notas de Texto**: Mensajes cortos (máx. 30 caracteres) para expresar estados de ánimo o indirectas.
* **Caducidad**: Las notas desaparecen automáticamente después de **7 días**.

### 🏷️ Dinámica de Etiquetas (Tags)
La identidad de cada perfil es construida por la comunidad:
* **Crowdsourcing**: Cualquier usuario puede asignar una etiqueta (ej. *"El de Sistemas"*, *"Canta bien"*) al perfil de otro.
* **Verificación Democrática**: Si una etiqueta alcanza **15 apoyos**, se marca automáticamente como verificada <i class="fas fa-check-circle"></i>.

### 💬 Foro Anónimo
Un espacio para opiniones libres:
* **Anonimato con Huella**: Los comentarios son anónimos, pero incluyen un identificador único (ej. *Anónimo #A1B2*) para mantener el hilo de la conversación.
* **Sin Edición**: Una vez enviado, el comentario no se puede modificar, garantizando la espontaneidad (y el riesgo) de lo expresado.

### 🛡️ Control Total vs. Transparencia Pública
El dueño del perfil tiene el poder absoluto, pero con un costo social:
* **Poder de Moderación**: Como dueño de tu perfil, puedes **eliminar inmediatamente** cualquier tag, nota o comentario que no te guste.
* **Contador de Censura**: Para equilibrar este poder, existe un **contador público de eliminaciones** (*"Este usuario ha eliminado 5 elementos"*). La comunidad sabrá qué tan tolerante (o no) eres con las opiniones de los demás.

## ✨ Otras Características

* **🗳️ Votación en Vivo**: Propón canciones y vota por las de otros. El sistema prioriza automáticamente la música con mayor apoyo.
* **🎧 Integración con Spotify**: Acceso a un catálogo inmenso para una reproducción de alta calidad.
* **🕵️ Privacidad y Derecho al Olvido**:
    * No se guardan datos sensibles.
    * Posibilidad de **eliminación inmediata y permanente** del perfil si así lo deseas.
* **🌗 Diseño Moderno**: Interfaz receptiva y atractiva visualmente.

## ⚙️ Tecnologías Utilizadas

* **Frontend**: Angular 16
* **Backend/BaaS**: Supabase
* **Integraciones**: Spotify Web API
* **Lenguajes**: TypeScript, SCSS, HTML5
* **Estilos**: Bootstrap 5 (Responsive Design)

## 📂 Estructura del Proyecto

```
src/app/components/
│
├── about/                  # Información del proyecto y reglas
├── admin-login/            # Autenticación de administradores
├── admin-panel/            # Panel de gestión
├── announcement/           # Sistema de anuncios
├── buitres/                # Exploración de perfiles (Listado)
├── buitres-detail/         # Perfil Social (Notas, Tags, Foro)
├── discussion/             # Foros o discusiones
├── floating-chat/          # Chat flotante global
├── home/                   # Página principal de votación
├── modal/                  # Componentes modales reutilizables
├── ranking/                # Rankings de canciones/usuarios
├── schedule/               # Horarios
├── search/                 # Búsqueda de canciones
├── transportation/         # Módulo de transporte
├── voting/                 # Lógica de votación
└── voting-list/            # Lista de reproducción votada
```

## 🚀 Instrucciones de Ejecución

Para ejecutar este proyecto en tu entorno local:

### Requisitos
* Node.js (LTS recomendado)
* Angular CLI (`npm install -g @angular/cli`)
* Cuenta en Supabase y configuración de API de Spotify

### Pasos

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/SebastianVega4/Music_Uptc_Sogamoso.git
    cd Music_Uptc_Sogamoso
    ```

2.  **Instalar dependencias**:
    ```bash
    npm install
    ```

3.  **Configurar Variables de Entorno**:
    Asegúrate de configurar tus credenciales de Supabase y Spotify en los archivos de entorno (`src/environments`).

4.  **Ejecutar el servidor de desarrollo**:
    ```bash
    ng serve
    ```

5.  **Acceder a la aplicación**:
    Abre tu navegador en `http://localhost:4200/`.

---

## 👨‍🎓 Autor

Desarrollado con pasión por **Sebastián Vega**

*Estudiante de Ingeniería de Sistemas - UPTC Sogamoso*

🔗 [LinkedIn](https://www.linkedin.com/in/johan-sebastian-vega-ruiz-b1292011b/) | 🔗 [GitHub](https://github.com/SebastianVega4) | 🔗 [Instagram](https://www.instagram.com/sebastian.vegar/)

---

## 📜 Licencia

Este proyecto está bajo la Licencia **GPL 3.0**.

---

**Facultad de Ingeniería — Ingeniería de Sistemas** 🧩

🏫 **Universidad Pedagógica y Tecnológica de Colombia (UPTC)**
📍 Sogamoso, Boyacá

© 2025 — Sebastian Vega