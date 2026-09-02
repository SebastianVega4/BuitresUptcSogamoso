from dotenv import load_dotenv
try:
    load_dotenv(encoding='utf-8')
except UnicodeDecodeError:
    load_dotenv(encoding='utf-16')

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import hashlib
import threading
import time
import requests
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
import json
import bcrypt
import jwt
import uuid
import redis

app = Flask(__name__)

allowed_origins = [
    "http://localhost:4200",
    "https://buitres-uptc-sogamoso.vercel.app",
    "https://sebastianvega4.github.io",
]

CORS(app, origins=allowed_origins, supports_credentials=True)

@app.after_request
def after_request(response):
    response.headers.add('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.add('Pragma', 'no-cache')
    response.headers.add('Expires', '0')
    response.headers.add('Access-Control-Max-Age', '86400')
    return response

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

from werkzeug.utils import secure_filename
from flask import send_from_directory
from utils.image_handler import upload_to_r2, optimize_image

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    """Serve locally uploaded files (legacy/fallback)."""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        r2_url = upload_to_r2(file)
        if r2_url:
            return jsonify({'url': r2_url, 'filename': r2_url.split('/')[-1]}), 201

        try:
            file.seek(0)
            result = optimize_image(file)
            filename = result[0] if result else None
            if filename:
                os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.seek(0)
                file.save(file_path)
                file_url = f"{request.host_url}uploads/{filename}"
                return jsonify({'url': file_url, 'filename': filename}), 201
            else:
                return jsonify({'error': 'File type not allowed or upload failed'}), 400
        except Exception as e:
            print(f"Fallback save error: {e}")
            return jsonify({'error': 'Upload failed'}), 500
    return jsonify({'error': 'Upload failed'}), 500

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

REDIS_URL = os.environ.get("REDIS_URL")
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD")

JWT_SECRET = os.environ.get("JWT_SECRET", "846d56ad337d10a3")
JWT_ALGORITHM = "HS256"

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = jsonify()
        response.headers.add("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, PATCH, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization")
        response.headers.add("Access-Control-Allow-Credentials", "true")
        return response

def verify_jwt_auth():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return False
    try:
        token = auth_header.split('Bearer ')[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        result = supabase.table('admin_users').select('*').eq('id', payload['user_id']).execute()
        if not result.data:
            return False
        return True
    except Exception as e:
        print(f"Error decodificando token: {e}")
        return False

def get_admin_role():
    """Retorna el rol del admin ('super_admin', 'moderator', o None)."""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    try:
        token = auth_header.split('Bearer ')[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if 'user_id' not in payload:
            return None
        result = supabase.table('admin_users').select('role').eq('id', payload['user_id']).execute()
        if not result.data:
            return None
        return result.data[0].get('role', 'moderator')
    except Exception:
        return None

def is_super_admin():
    return get_admin_role() == 'super_admin'

def is_moderator():
    return get_admin_role() in ('super_admin', 'moderator')

def verify_uptc_auth():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return False, None
    try:
        token = auth_header.split('Bearer ')[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if 'user_id' in payload:
            result = supabase.table('admin_users').select('*').eq('id', payload['user_id']).execute()
            if result.data:
                return True, 'admin'
        if payload.get('role') == 'uptc_user':
            return True, 'uptc_user'
        return False, None
    except Exception:
        return False, None

def mask_email(email):
    return None

def get_user_fingerprint():
    if request.headers.get('X-Forwarded-For'):
        ip = request.headers.get('X-Forwarded-For').split(',')[0]
    else:
        ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', '')
    fingerprint_string = f"{ip}-{user_agent}"
    return hashlib.sha256(fingerprint_string.encode()).hexdigest()

def get_current_user_email():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    try:
        token = auth_header.split('Bearer ')[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get('user_email')
    except Exception:
        return None

def is_admin_user():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return False
    try:
        token = auth_header.split('Bearer ')[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        result = supabase.table('admin_users').select('*').eq('id', payload['user_id']).execute()
        if not result.data:
            return False
        return bool(result.data)
    except Exception as e:
        print(f"Error verificando admin: {e}")
        return False

@app.route('/api/auth/google', methods=['POST'])
def google_auth():
    try:
        data = request.get_json()
        id_token = data.get('idToken')
        if not id_token:
            return jsonify({"error": "Google ID Token requerido"}), 400
        google_verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        response = requests.get(google_verify_url)
        if response.status_code != 200:
            return jsonify({"error": "Token de Google inválido"}), 401
        token_info = response.json()
        email = token_info.get('email', '')
        if not email.endswith('@uptc.edu.co'):
            return jsonify({"error": "Solo se permiten cuentas institucionales @uptc.edu.co"}), 403
        token = jwt.encode({
            'user_email': email,
            'role': 'uptc_user',
            'exp': datetime.now(timezone.utc) + timedelta(days=7)
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return jsonify({
            "token": token,
            "user": {
                "email": email,
                "role": "uptc_user"
            }
        }), 200
    except Exception as e:
        print(f"Error en Google auth: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        result = supabase.table('admin_users').select('*').eq('email', email).execute()
        if not result.data:
            return jsonify({"error": "Credenciales inválidas"}), 401
        user = result.data[0]
        if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return jsonify({"error": "Credenciales inválidas"}), 401
        token = jwt.encode({
            'user_id': user['id'],
            'role': user.get('role', 'moderator'),
            'exp': datetime.now(timezone.utc) + timedelta(hours=24)
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return jsonify({
            "token": token,
            "user": {
                "id": user['id'],
                "email": user['email'],
                "role": user.get('role', 'moderator')
            }
        }), 200
    except Exception as e:
        print(f"Error en login: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500

@app.route('/api/auth', methods=['POST', 'OPTIONS'])
def handle_auth():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        result = supabase.table('admin_users').select('*').eq('email', email).execute()
        if not result.data:
            return jsonify({"error": "Credenciales inválidas"}), 401
        user = result.data[0]
        if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return jsonify({"error": "Credenciales inválidas"}), 401
        token = jwt.encode({
            'user_id': user['id'],
            'role': user.get('role', 'moderator'),
            'exp': datetime.now(timezone.utc) + timedelta(hours=24)
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return jsonify({
            "success": True,
            "token": token,
            "user": {
                "id": user['id'],
                "email": user['email'],
                "role": user.get('role', 'moderator')
            },
            "message": "Autenticación exitosa"
        }), 200
    except Exception as e:
        print(f"Error en autenticación: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    supabase_status = "connected"
    try:
        supabase.table('admin_settings').select('count', count='exact').execute()
    except Exception as e:
        supabase_status = f"disconnected: {str(e)}"
    status = {
        "database": supabase_status,
        "status": "ok" if supabase_status == "connected" else "degraded"
    }
    return jsonify(status), 200

@app.route('/api/discussion/threads', methods=['GET'])
def get_threads():
    try:
        sort_by = request.args.get('sort', 'updated_at')
        order = request.args.get('order', 'desc')
        result = supabase.table('discussion_threads')\
            .select('*')\
            .order(sort_by, desc=(order == 'desc'))\
            .execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/discussion/threads', methods=['POST'])
def create_thread():
    try:
        data = request.get_json()
        author_fingerprint = get_user_fingerprint()
        title = data.get('title', '').strip()
        content = data['content']
        if not title:
            title = content[:30] + "..." if len(content) > 30 else content
        thread_data = {
            'title': title,
            'content': content,
            'image_url': data.get('image_url'),
            'author_fingerprint': author_fingerprint,
            'user_email': get_current_user_email()
        }
        result = supabase.table('discussion_threads').insert(thread_data).execute()
        return jsonify(result.data[0]), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/discussion/threads/<thread_id>', methods=['GET', 'PATCH', 'DELETE'])
def manage_thread(thread_id):
    try:
        if request.method == 'GET':
            thread_result = supabase.table('discussion_threads')\
                .select('*')\
                .eq('id', thread_id)\
                .execute()
            if not thread_result.data:
                return jsonify({"error": "Hilo no encontrado"}), 404
            comments_result = supabase.table('thread_comments')\
                .select('*')\
                .eq('thread_id', thread_id)\
                .order('created_at', desc=False)\
                .execute()
            return jsonify({
                'thread': thread_result.data[0],
                'comments': comments_result.data
            }), 200
        if not verify_jwt_auth():
            return jsonify({"error": "No autorizado para esta acción"}), 401
        if request.method == 'DELETE':
            supabase.table('thread_comments').delete().eq('thread_id', thread_id).execute()
            supabase.table('discussion_likes').delete().eq('thread_id', thread_id).execute()
            supabase.table('discussion_threads').delete().eq('id', thread_id).execute()
            return jsonify({"message": "Hilo eliminado correctamente"}), 200
        if request.method == 'PATCH':
            data = request.get_json()
            update_data = {}
            if 'title' in data: update_data['title'] = data['title']
            if 'content' in data: update_data['content'] = data['content']
            if 'image_url' in data: update_data['image_url'] = data['image_url']
            if not update_data:
                return jsonify({"error": "No hay datos para actualizar"}), 400
            result = supabase.table('discussion_threads')\
                .update(update_data)\
                .eq('id', thread_id)\
                .execute()
            return jsonify(result.data[0]), 200
    except Exception as e:
        print(f"Error en manage_thread: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/discussion/threads/<thread_id>/comments', methods=['POST'])
def add_comment(thread_id):
    try:
        data = request.get_json()
        author_fingerprint = get_user_fingerprint()
        comment_data = {
            'thread_id': thread_id,
            'author_fingerprint': author_fingerprint,
            'content': data['content'],
            'parent_comment_id': data.get('parent_comment_id'),
            'user_email': get_current_user_email()
        }
        result = supabase.table('thread_comments').insert(comment_data).execute()
        comments_count = supabase.table('thread_comments')\
            .select('id', count='exact')\
            .eq('thread_id', thread_id)\
            .execute()
        supabase.table('discussion_threads')\
            .update({'comments_count': comments_count.count})\
            .eq('id', thread_id)\
            .execute()
        return jsonify(result.data[0]), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/discussion/like', methods=['POST'])
def like_item():
    try:
        data = request.get_json()
        user_fingerprint = get_user_fingerprint()
        like_data = {
            'user_fingerprint': user_fingerprint,
            'thread_id': data.get('thread_id'),
            'comment_id': data.get('comment_id'),
            'user_email': get_current_user_email()
        }
        existing_query = supabase.table('discussion_likes')\
            .select('*')\
            .match({k: v for k, v in like_data.items() if v is not None})\
            .execute()
        if existing_query.data:
            supabase.table('discussion_likes')\
                .delete()\
                .match({k: v for k, v in like_data.items() if v is not None})\
                .execute()
            action = 'unliked'
        else:
            supabase.table('discussion_likes').insert(like_data).execute()
            action = 'liked'
        if data.get('thread_id'):
            count_query = supabase.table('discussion_likes')\
                .select('id', count='exact')\
                .eq('thread_id', data['thread_id'])\
                .execute()
            new_count = count_query.count
            supabase.table('discussion_threads')\
                .update({'likes_count': new_count})\
                .eq('id', data['thread_id'])\
                .execute()
        elif data.get('comment_id'):
            count_query = supabase.table('discussion_likes')\
                .select('id', count='exact')\
                .eq('comment_id', data['comment_id'])\
                .execute()
            new_count = count_query.count
            supabase.table('thread_comments')\
                .update({'likes_count': new_count})\
                .eq('id', data['comment_id'])\
                .execute()
        return jsonify({"message": action, "new_count": new_count}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

redis_client = None
try:
    if REDIS_URL and REDIS_PASSWORD:
        redis_connection_string = f"rediss://:{REDIS_PASSWORD}@{REDIS_URL}"
        redis_client = redis.from_url(
            redis_connection_string,
            ssl_cert_reqs=None,
            decode_responses=True
        )
        redis_client.ping()
    else:
        redis_client = None
except Exception as e:
    print(f"Error conectando a Redis: {e}")
    redis_client = None

online_users_memory = {}

@app.route('/api/chat/messages', methods=['GET'])
def get_chat_messages():
    try:
        room = request.args.get('room', 'general')
        limit = min(int(request.args.get('limit', 100)), 200)
        since_iso = request.args.get('since_iso')
        query = supabase.table('chat_messages')\
            .select('*')\
            .eq('room', room)\
            .order('created_at', desc=True)\
            .limit(limit)
        if since_iso:
            query = query.gte('created_at', since_iso)
        result = query.execute()
        messages = []
        if result.data:
            for msg in reversed(result.data):
                messages.append({
                    'id': msg['id'],
                    'user': msg['user_name'],
                    'user_id': msg.get('user_id', ''),
                    'message': msg['message'],
                    'timestamp': msg['created_at'],
                    'room': msg['room'],
                    'type': msg.get('message_type', 'message')
                })
        return jsonify({
            'messages': messages,
            'total': len(messages),
            'room': room,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200
    except Exception as e:
        print(f'Error obteniendo mensajes: {e}')
        return jsonify({"error": "Error obteniendo mensajes"}), 500

@app.route('/api/chat/messages/<message_id>', methods=['DELETE'])
def delete_chat_message(message_id):
    if not verify_jwt_auth():
        return jsonify({"error": "Credenciales inválidas"}), 401
    try:
        result = supabase.table('chat_messages').delete().eq('id', message_id).execute()
        return jsonify({"success": True, "message": "Mensaje eliminado"}), 200
    except Exception as e:
        print(f"Error eliminando mensaje: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat/heartbeat', methods=['POST', 'OPTIONS'])
def chat_heartbeat():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        room = data.get('room', 'general')
        if not user_id:
            return jsonify({"error": "User ID required"}), 400
        current_time = datetime.now(timezone.utc).timestamp()
        if redis_client:
            redis_client.setex(f"presence:{room}:{user_id}", 130, str(current_time))
        else:
            if room not in online_users_memory:
                online_users_memory[room] = {}
            online_users_memory[room][user_id] = current_time
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"Error en heartbeat: {e}")
        return jsonify({"error": "Error registering heartbeat"}), 500

@app.route('/api/chat/online-users', methods=['GET'])
def get_online_users():
    try:
        room = request.args.get('room', 'general')
        current_time = datetime.now(timezone.utc).timestamp()
        online_count = 0
        if redis_client:
            try:
                keys = redis_client.keys(f"presence:{room}:*")
                online_count = len(keys)
            except Exception as e:
                print(f"Error Redis online users: {e}")
                online_count = 0
        else:
            if room in online_users_memory:
                active_users = {
                    uid: ts for uid, ts in online_users_memory[room].items()
                    if current_time - ts < 130
                }
                online_users_memory[room] = active_users
                online_count = len(active_users)
        return jsonify({
            'online_users': max(1, online_count),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200
    except Exception as e:
        print(f'Error obteniendo usuarios online: {e}')
        return jsonify({"online_users": 1}), 200

@app.route('/api/chat/send', methods=['POST'])
def send_chat_message():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Datos JSON requeridos"}), 400
        message_text = data.get('message', '').strip()
        user = data.get('user', 'Usuario').strip()
        user_id = data.get('user_id', '').strip()
        room = data.get('room', 'general').strip()
        if not message_text:
            return jsonify({"error": "El mensaje no puede estar vacío"}), 400
        if len(message_text) > 1000:
            return jsonify({"error": "El mensaje es demasiado largo"}), 400
        user_lower = user.lower()
        admin_keywords = ['admin', 'administrador', 'moderador', 'mod', 'staff']
        contains_reserved = any(keyword in user_lower for keyword in admin_keywords)
        if contains_reserved:
            if not is_admin_user():
                return jsonify({
                    "error": "Este nombre está reservado para administradores. Por favor, elige otro nombre."
                }), 403
        reserved_names = ['admin', 'administrador', 'moderador']
        if user_lower in reserved_names and not is_admin_user():
            return jsonify({
                "error": "Este nombre está reservado exclusivamente para administradores."
            }), 403
        message_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        try:
            db_result = supabase.table('chat_messages').insert({
                'id': message_id,
                'user_name': user,
                'user_id': user_id,
                'message': message_text,
                'room': room,
                'message_type': 'message',
                'created_at': timestamp
            }).execute()
            if not db_result.data:
                return jsonify({"error": "Error guardando mensaje en BD"}), 500
            message_data = {
                'id': message_id,
                'user': user,
                'user_id': user_id,
                'message': message_text,
                'timestamp': timestamp,
                'room': room,
                'type': 'message'
            }
            return jsonify({
                'success': True,
                'message': message_data
            }), 200
        except Exception as db_error:
            print(f'Error guardando en BD: {db_error}')
            return jsonify({"error": "Error guardando mensaje"}), 500
    except Exception as e:
        print(f'Error enviando mensaje: {e}')
        return jsonify({"error": "Error enviando mensaje"}), 500

@app.route('/api/chat/validate-username', methods=['POST'])
def validate_username():
    try:
        data = request.get_json()
        username = data.get('username', '').strip().lower()
        if not username:
            return jsonify({"valid": False, "error": "El nombre no puede estar vacío"}), 400
        reserved_names = ['admin', 'administrador', 'moderador', 'mod', 'staff']
        admin_keywords = ['admin', 'administrador', 'moderador']
        is_admin = is_admin_user()
        if username in reserved_names:
            if is_admin:
                return jsonify({"valid": True, "is_admin": True}), 200
            else:
                return jsonify({
                    "valid": False,
                    "error": "Este nombre está reservado para administradores"
                }), 200
        contains_admin_keyword = any(keyword in username for keyword in admin_keywords)
        if contains_admin_keyword:
            if is_admin:
                return jsonify({"valid": True, "is_admin": True}), 200
            else:
                return jsonify({
                    "valid": False,
                    "error": "El nombre no puede contener palabras reservadas para administradores"
                }), 200
        return jsonify({"valid": True}), 200
    except Exception as e:
        print(f'Error validando username: {e}')
        return jsonify({"valid": False, "error": "Error validando nombre"}), 500

@app.route('/api/chat/stats', methods=['GET'])
def get_chat_stats():
    try:
        total_result = supabase.table('chat_messages')\
            .select('id', count='exact')\
            .execute()
        total_messages = total_result.count if total_result.count else 0
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_result = supabase.table('chat_messages')\
            .select('id', count='exact')\
            .gte('created_at', today_start.isoformat())\
            .execute()
        messages_today = today_result.count if today_result.count else 0
        online_users = 1
        return jsonify({
            'total_messages': total_messages,
            'messages_today': messages_today,
            'online_users': online_users,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200
    except Exception as e:
        print(f'Error obteniendo stats: {e}')
        return jsonify({
            'total_messages': 0,
            'messages_today': 0,
            'online_users': 1,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200

@app.route('/api/chat/typing', methods=['POST', 'OPTIONS'])
def set_typing_status():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json()
        user = data.get('user', 'Usuario')
        room = data.get('room', 'general')
        is_typing = data.get('is_typing', False)
        if redis_client:
            try:
                if is_typing:
                    redis_client.setex(
                        f'typing:{room}:{user}',
                        5,
                        'true'
                    )
                else:
                    redis_client.delete(f'typing:{room}:{user}')
            except Exception as e:
                print(f'Error actualizando typing status: {e}')
        return jsonify({'success': True}), 200
    except Exception as e:
        print(f'Error en typing: {e}')
        return jsonify({"error": "Error actualizando estado"}), 500

@app.route('/api/chat/typing-users', methods=['GET'])
def get_typing_users():
    try:
        room = request.args.get('room', 'general')
        typing_users = []
        if redis_client:
            try:
                keys = redis_client.keys(f'typing:{room}:*')
                current_time = datetime.now(timezone.utc)
                for key in keys:
                    ttl = redis_client.ttl(key)
                    if ttl > 0:
                        username = key.split(':')[-1]
                        typing_users.append(username)
            except Exception as e:
                print(f'Error obteniendo typing users: {e}')
        return jsonify({
            'typing_users': typing_users,
            'room': room,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 200
    except Exception as e:
        print(f'Error obteniendo typing users: {e}')
        return jsonify({"typing_users": []}), 200

@app.route('/api/buitres/people', methods=['GET'])
def get_buitres_people():
    is_authed, role = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "Debes iniciar sesión con tu cuenta UPTC para ver esta sección"}), 401
    try:
        search = request.args.get('search', '')
        sort_by = request.args.get('sortBy', 'recent')
        table_name = 'buitres_people'
        if sort_by in ['comments', 'tags', 'notes']:
            table_name = 'buitres_stats'
        query = supabase.table(table_name).select('*').eq('is_merged', False)
        if search:
            words = search.strip().split()
            if words:
                if len(words) == 1:
                    query = query.or_(f"name.ilike.%{search}%,email.ilike.%{search}%")
                else:
                    for word in words:
                        query = query.ilike("name", f"%{word}%")
        people = []
        try:
            if sort_by == 'recent':
                try:
                    result = query.order('updated_at', desc=True).order('created_at', desc=True).limit(100).execute()
                except Exception:
                    query = supabase.table(table_name).select('*').eq('is_merged', False)
                    if search:
                        words = search.strip().split()
                        if len(words) == 1:
                            query = query.or_(f"name.ilike.%{search}%,email.ilike.%{search}%")
                        else:
                            for word in words:
                                query = query.ilike("name", f"%{word}%")
                    result = query.order('created_at', desc=True).limit(100).execute()
            elif sort_by == 'likes':
                result = query.order('likes_count', desc=True).limit(100).execute()
            elif sort_by == 'comments':
                result = query.order('comments_count', desc=True).limit(100).execute()
            elif sort_by == 'tags':
                result = query.order('tags_count', desc=True).limit(100).execute()
            elif sort_by == 'notes':
                try:
                    result = query.order('notes_count', desc=True).limit(100).execute()
                except Exception:
                    result = query.limit(100).execute()
            else:
                result = query.limit(100).execute()
            people = result.data or []
        except Exception as e:
            print(f"Error fetching main results: {e}")
            people = []
        if search:
            try:
                tag_query = supabase.table('buitres_details').select('person_id').ilike('content', f'%{search}%').limit(50)
                tag_res = tag_query.execute()
                if tag_res.data:
                    tag_ids = [item['person_id'] for item in tag_res.data]
                    existing_ids = {p['id'] for p in people}
                    new_ids = [tid for tid in tag_ids if tid not in existing_ids]
                    if new_ids:
                        try:
                            tag_people_res = supabase.table(table_name).select('*').in_('id', new_ids).execute()
                        except:
                            tag_people_res = supabase.table('buitres_people').select('*').in_('id', new_ids).execute()
                        if tag_people_res.data:
                            people.extend(tag_people_res.data)
            except Exception as e:
                print(f"Error fetching tag matches: {e}")
        def get_sort_value(p, key):
            val = p.get(key)
            return val if val is not None else 0
        def get_date_value(p, key):
            val = p.get(key)
            return val if val else ''
        if sort_by == 'recent':
            people.sort(key=lambda x: (get_date_value(x, 'updated_at'), get_date_value(x, 'created_at')), reverse=True)
        elif sort_by == 'likes':
            people.sort(key=lambda x: get_sort_value(x, 'likes_count'), reverse=True)
        elif sort_by == 'comments':
            people.sort(key=lambda x: get_sort_value(x, 'comments_count'), reverse=True)
        elif sort_by == 'tags':
            people.sort(key=lambda x: get_sort_value(x, 'tags_count'), reverse=True)
        elif sort_by == 'notes':
            people.sort(key=lambda x: get_sort_value(x, 'notes_count'), reverse=True)
        if role != 'admin':
            for person in people:
                person['email'] = None
        return jsonify(people), 200
    except Exception as e:
        print(f"Error general obteniendo buitres: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/count', methods=['GET'])
def get_buitres_count():
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"count": 0}), 401
    try:
        result = supabase.table('buitres_people')\
            .select('id', count='exact')\
            .eq('is_merged', False)\
            .execute()
        return jsonify({"count": result.count if result.count else 0}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/<person_id>', methods=['GET'])
def get_buitre_by_id(person_id):
    is_authed, role = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "No autorizado"}), 401
    try:
        result = supabase.table('buitres_people').select('*').eq('id', person_id).single().execute()
        person = result.data
        user_email = get_current_user_email()
        is_owner = user_email and person.get('email') and user_email.lower() == person['email'].strip().lower()
        if role != 'admin' and not is_owner:
            person['email'] = None
        return jsonify(person), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people', methods=['POST'])
def create_buitre():
    try:
        data = request.get_json()
        now = datetime.now(timezone.utc).isoformat()
        person_data = {
            'name': data['name'],
            'description': data['description'],
            'gender': data['gender'],
            'updated_at': now,
            'created_at': now
        }
        if 'email' in data:
            person_data['email'] = data['email']
        result = supabase.table('buitres_people').insert([person_data]).execute()
        return jsonify(result.data[0]), 201
    except Exception as e:
        print(f"Error creando buitre: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/<person_id>', methods=['PATCH'])
def update_buitre(person_id):
    is_authed, role = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "No autorizado"}), 401
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        if role != 'admin':
            user_email = get_current_user_email()
            person_result = supabase.table('buitres_people').select('email').eq('id', person_id).single().execute()
            person = person_result.data
            if not person or not person.get('email') or person['email'] != user_email:
                return jsonify({"error": "No tienes permiso para editar este perfil"}), 403
            allowed_fields = ['gender', 'image_url']
            data = {k: v for k, v in data.items() if k in allowed_fields}
            if not data:
                return jsonify({"error": "Solo puedes editar el género o la imagen de tu perfil"}), 400
        else:
            fields_to_remove = ['id', 'created_at', 'likes_count', 'dislikes_count', 'is_merged', 'merged_into']
            for field in fields_to_remove:
                data.pop(field, None)
        data['updated_at'] = datetime.now(timezone.utc).isoformat()
        try:
            result = supabase.table('buitres_people').update(data).eq('id', person_id).execute()
        except Exception as e:
            raise e
        if not result.data:
            return jsonify({"error": "Profile not found or no changes applied"}), 404
        return jsonify(result.data[0]), 200
    except Exception as e:
        print(f"Error updating buitre ({person_id}): {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/<person_id>', methods=['DELETE'])
def delete_buitre(person_id):
    if not verify_jwt_auth():
        return jsonify({"error": "No autorizado"}), 401
    try:
        supabase.table('buitres_people').delete().eq('id', person_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/<person_id>/details', methods=['GET'])
def get_buitre_details(person_id):
    try:
        result = supabase.table('buitres_details')\
            .select('*')\
            .eq('person_id', person_id)\
            .order('occurrence_count', desc=True)\
            .execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def update_buitre_activity(person_id):
    try:
        supabase.table('buitres_people').update({
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', person_id).execute()
    except Exception as e:
        print(f"Error actualizando actividad: {e}")

def increment_deletion_count(person_id):
    try:
        res = supabase.table('buitres_people').select('deletions_count').eq('id', person_id).single().execute()
        current_count = res.data.get('deletions_count', 0) or 0
        supabase.table('buitres_people').update({
            'deletions_count': current_count + 1,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }).eq('id', person_id).execute()
    except Exception as e:
        print(f"Error incrementando deletion count: {e}")

@app.route('/api/buitres/people/<person_id>/details', methods=['POST'])
def add_buitre_detail(person_id):
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "Debes iniciar sesión para votar etiquetas"}), 401
    try:
        update_buitre_activity(person_id)
        data = request.get_json()
        content = data['content'].strip()
        fingerprint = data.get('fingerprint', get_user_fingerprint())
        interaction_check = supabase.table('buitres_interactions')\
            .select('*')\
            .eq('target_id', person_id)\
            .eq('target_type', 'tag_vote')\
            .eq('author_fingerprint', fingerprint)\
            .eq('content_snapshot', content)\
            .execute()
        has_voted = bool(interaction_check.data)
        detail_query = supabase.table('buitres_details')\
            .select('*')\
            .eq('person_id', person_id)\
            .ilike('content', content)\
            .execute()
        if has_voted:
            supabase.table('buitres_interactions')\
                .delete()\
                .eq('target_id', person_id)\
                .eq('target_type', 'tag_vote')\
                .eq('author_fingerprint', fingerprint)\
                .eq('content_snapshot', content)\
                .execute()
            if detail_query.data:
                detail_id = detail_query.data[0]['id']
                current_count = detail_query.data[0].get('occurrence_count', 1)
                new_count = max(0, int(current_count) - 1)
                result = supabase.table('buitres_details')\
                    .update({'occurrence_count': new_count})\
                    .eq('id', detail_id)\
                    .execute()
                if new_count == 0:
                    supabase.table('buitres_details').delete().eq('id', detail_id).execute()
                    supabase.table('buitres_interactions')\
                        .delete()\
                        .eq('target_id', person_id)\
                        .eq('target_type', 'tag_create')\
                        .eq('content_snapshot', content)\
                        .execute()
                    return jsonify({"action": "removed", "new_count": 0, "deleted": True}), 200
                data = result.data[0] if result.data else {"content": content, "occurrence_count": new_count}
                return jsonify({"action": "removed", "new_count": new_count, "data": data}), 200
            else:
                return jsonify({"action": "removed", "new_count": 0, "deleted": True}), 200
        else:
            if detail_query.data:
                detail_id = detail_query.data[0]['id']
                real_content = detail_query.data[0]['content']
                supabase.table('buitres_interactions').insert({
                    'target_id': person_id,
                    'target_type': 'tag_vote',
                    'author_fingerprint': fingerprint,
                    'content_snapshot': real_content,
                    'user_email': get_current_user_email()
                }).execute()
                raw_count = detail_query.data[0].get('occurrence_count')
                current_count = int(raw_count) if raw_count is not None else 0
                new_count = current_count + 1
                result = supabase.table('buitres_details')\
                    .update({'occurrence_count': new_count})\
                    .eq('id', detail_id)\
                    .execute()
                data = result.data[0] if result.data else {"content": real_content, "occurrence_count": new_count}
                return jsonify({"action": "added", "new_count": new_count, "data": data}), 200
            else:
                user_creations_count = supabase.table('buitres_interactions')\
                    .select('id', count='exact')\
                    .eq('target_id', person_id)\
                    .eq('target_type', 'tag_create')\
                    .eq('author_fingerprint', fingerprint)\
                    .execute()
                creations = user_creations_count.count if user_creations_count.count else 0
                if creations >= 5:
                    return jsonify({
                        "error": "Has alcanzado el límite de 5 etiquetas creadas por perfil. Puedes apoyar todas las etiquetas existentes que quieras."
                    }), 400
                result = supabase.table('buitres_details').insert({
                    'person_id': person_id,
                    'content': content,
                    'occurrence_count': 1,
                    'user_email': get_current_user_email()
                }).execute()
                supabase.table('buitres_interactions').insert({
                    'target_id': person_id,
                    'target_type': 'tag_create',
                    'author_fingerprint': fingerprint,
                    'content_snapshot': content,
                    'user_email': get_current_user_email()
                }).execute()
                supabase.table('buitres_interactions').insert({
                    'target_id': person_id,
                    'target_type': 'tag_vote',
                    'author_fingerprint': fingerprint,
                    'content_snapshot': content,
                    'user_email': get_current_user_email()
                }).execute()
                data = result.data[0] if result.data else {"content": content, "occurrence_count": 1}
                return jsonify({"action": "added", "new_count": 1, "data": data}), 201
    except Exception as e:
        print(f"Error en add_buitre_detail: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/details/<detail_id>', methods=['DELETE'])
def delete_buitre_detail(detail_id):
    is_authed, role = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "No autorizado"}), 401
    try:
        detail_res = supabase.table('buitres_details').select('person_id').eq('id', detail_id).single().execute()
        if not detail_res.data:
            return jsonify({"error": "Detalle no encontrado"}), 404
        person_id = detail_res.data['person_id']
        update_buitre_activity(person_id)
        if role != 'admin':
            user_email = get_current_user_email()
            person_res = supabase.table('buitres_people').select('email').eq('id', person_id).single().execute()
            person = person_res.data
            if not person or not person.get('email') or person['email'] != user_email:
                return jsonify({"error": "No tienes permiso para eliminar etiquetas de este perfil"}), 403
            increment_deletion_count(person_id)
        supabase.table('buitres_details').delete().eq('id', detail_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/<person_id>/comments', methods=['GET'])
def get_buitre_comments(person_id):
    try:
        result = supabase.table('buitres_comments')\
            .select('*')\
            .eq('person_id', person_id)\
            .order('created_at', desc=True)\
            .execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/<person_id>/comments', methods=['POST'])
def add_buitre_comment(person_id):
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "Debes iniciar sesión para comentar"}), 401
    try:
        update_buitre_activity(person_id)
        data = request.get_json()
        content = data['content']
        fingerprint = data.get('fingerprint', get_user_fingerprint())
        comment_data = {
            'person_id': person_id,
            'content': content,
            'author_fingerprint': fingerprint,
            'user_email': get_current_user_email()
        }
        result = supabase.table('buitres_comments').insert([comment_data]).execute()
        return jsonify(result.data[0]), 201
    except Exception as e:
        print(f"Error en add_buitre_comment: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/comments/<comment_id>', methods=['DELETE'])
def delete_buitre_comment(comment_id):
    is_authed, role = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "No autorizado"}), 401
    try:
        comment_res = supabase.table('buitres_comments').select('person_id').eq('id', comment_id).single().execute()
        if not comment_res.data:
            return jsonify({"error": "Comentario no encontrado"}), 404
        person_id = comment_res.data['person_id']
        update_buitre_activity(person_id)
        if role != 'admin':
            user_email = get_current_user_email()
            person_res = supabase.table('buitres_people').select('email').eq('id', person_id).single().execute()
            person = person_res.data
            if not person or not person.get('email') or person['email'] != user_email:
                return jsonify({"error": "No tienes permiso para eliminar comentarios de este perfil"}), 403
            increment_deletion_count(person_id)
        supabase.table('buitres_comments').delete().eq('id', comment_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/comments/<comment_id>/like', methods=['POST'])
def like_buitre_comment(comment_id):
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "Debes iniciar sesión para dar like"}), 401
    try:
        data = request.get_json() or {}
        fingerprint = data.get('fingerprint', get_user_fingerprint())
        interaction_check = supabase.table('buitres_interactions')\
            .select('*')\
            .eq('target_id', comment_id)\
            .eq('target_type', 'comment_like')\
            .eq('author_fingerprint', fingerprint)\
            .execute()
        has_liked = bool(interaction_check.data)
        comment_query = supabase.table('buitres_comments')\
            .select('*')\
            .eq('id', comment_id)\
            .execute()
        if not comment_query.data:
            return jsonify({"error": "Comentario no encontrado"}), 404
        comment = comment_query.data[0]
        update_buitre_activity(comment.get('person_id'))
        current_likes = comment.get('likes_count', 0)
        if has_liked:
            supabase.table('buitres_interactions')\
                .delete()\
                .eq('target_id', comment_id)\
                .eq('target_type', 'comment_like')\
                .eq('author_fingerprint', fingerprint)\
                .execute()
            raw_likes = comment.get('likes_count')
            current_likes = int(raw_likes) if raw_likes is not None else 0
            new_likes = max(0, current_likes - 1)
            result = supabase.table('buitres_comments')\
                .update({'likes_count': new_likes})\
                .eq('id', comment_id)\
                .execute()
            if not result.data:
                print(f"ALERTA: No se actualizó el comentario {comment_id}. Posible bloqueo RLS.")
            return jsonify({"action": "removed", "new_likes": new_likes}), 200
        else:
            supabase.table('buitres_interactions').insert({
                'target_id': comment_id,
                'target_type': 'comment_like',
                'author_fingerprint': fingerprint
            }).execute()
            raw_likes = comment.get('likes_count')
            current_likes = int(raw_likes) if raw_likes is not None else 0
            new_likes = current_likes + 1
            result = supabase.table('buitres_comments')\
                .update({'likes_count': new_likes})\
                .eq('id', comment_id)\
                .execute()
            if not result.data:
                print(f"ALERTA: No se actualizó el comentario {comment_id}. Posible bloqueo RLS.")
            return jsonify({"action": "added", "new_likes": new_likes}), 200
    except Exception as e:
        print(f"Error en like_buitre_comment: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/<person_id>/vote', methods=['POST'])
def vote_buitre(person_id):
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "Debes iniciar sesión para votar"}), 401
    try:
        update_buitre_activity(person_id)
        data = request.get_json()
        vote_type = data['type']
        fingerprint = data.get('fingerprint', get_user_fingerprint())
        result = supabase.rpc('vote_person', {
            'p_person_id': person_id,
            'p_type': vote_type,
            'p_fingerprint': fingerprint
        }).execute()
        return jsonify(result.data), 200
    except Exception as e:
        if "23505" in str(e):
            return jsonify({"error": "Ya has votado por esta persona."}), 400
        print(f"Error en vote_buitre: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/merge', methods=['POST'])
def merge_buitres():
    if not verify_jwt_auth():
        return jsonify({"error": "No autorizado"}), 401
    try:
        data = request.get_json()
        keep_id = data['keepId']
        remove_id = data['removeId']
        result = supabase.rpc('merge_buitres', {
            'p_keep_id': keep_id,
            'p_remove_id': remove_id
        }).execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/people/<person_id>/songs', methods=['GET'])
def get_person_songs(person_id):
    try:
        result = supabase.table('buitres_song_notes')\
            .select('*')\
            .eq('person_id', person_id)\
            .order('created_at', desc=True)\
            .execute()
        return jsonify(result.data), 200
    except Exception as e:
        print(f"Error getting song notes: {e}")
        return jsonify([]), 200

@app.route('/api/buitres/people/<person_id>/songs', methods=['POST'])
def add_person_song(person_id):
    is_authed, role = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "Debes iniciar sesión con tu cuenta UPTC"}), 401
    try:
        data = request.get_json()
        note_type = data.get('type', 'song')
        track_data = None
        dedication = data.get('dedication', '')
        if note_type == 'song':
            track_data = data.get('track_data')
            if not track_data:
                return jsonify({"error": "Faltan datos de la canción"}), 400
        else:
            if not dedication:
                return jsonify({"error": "El contenido de la nota no puede estar vacío"}), 400
            track_data = {
                'type': 'text',
                'bg_color': data.get('bg_color', 'linear-gradient(45deg, #FF9A9E 0%, #FECFEF 99%, #FECFEF 100%)')
            }

        existing = supabase.table('buitres_song_notes')\
            .select('id')\
            .eq('person_id', person_id)\
            .order('created_at', desc=False)\
            .execute()
        if existing.data and len(existing.data) >= 30:
            oldest_id = existing.data[0]['id']
            supabase.table('buitres_song_notes').delete().eq('id', oldest_id).execute()

        note_data = {
            'person_id': person_id,
            'track_data': track_data,
            'dedication': dedication,
            'created_by': get_current_user_email()
        }
        result = supabase.table('buitres_song_notes').insert(note_data).execute()
        return jsonify(result.data[0]), 201
    except Exception as e:
        print(f"Error adding song note: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/buitres/songs/<note_id>', methods=['DELETE'])
def delete_song_note(note_id):
    try:
        note_res = supabase.table('buitres_song_notes').select('person_id').eq('id', note_id).execute()
        if not note_res.data:
            return jsonify({"error": "Nota no encontrada"}), 404
        person_id = note_res.data[0]['person_id']
        is_authorized = False
        if is_admin_user():
            is_authorized = True
        is_owner = False
        if not is_authorized:
            current_email = get_current_user_email()
            if current_email:
                person_res = supabase.table('buitres_people').select('email').eq('id', person_id).execute()
                if person_res.data and person_res.data[0].get('email') == current_email:
                    is_authorized = True
                    is_owner = True
        if not is_authorized:
            return jsonify({"error": "No tienes permiso para eliminar esta nota"}), 403
        if is_owner:
            increment_deletion_count(person_id)
        supabase.table('buitres_song_notes').delete().eq('id', note_id).execute()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

SPOTIFY_CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.environ.get("SPOTIFY_CLIENT_SECRET", "")
_spotify_token = None
_spotify_token_expires = 0

def get_spotify_token():
    global _spotify_token, _spotify_token_expires
    import time
    if _spotify_token and time.time() < _spotify_token_expires:
        return _spotify_token
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return None
    try:
        resp = requests.post(
            'https://accounts.spotify.com/api/token',
            data={'grant_type': 'client_credentials', 'client_id': SPOTIFY_CLIENT_ID, 'client_secret': SPOTIFY_CLIENT_SECRET},
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=5
        )
        if resp.status_code == 200:
            data = resp.json()
            _spotify_token = data['access_token']
            _spotify_token_expires = time.time() + data.get('expires_in', 3600) - 60
            return _spotify_token
    except Exception as e:
        print(f"Spotify token error: {e}")
    return None

@app.route('/api/search', methods=['GET'])
def search_music():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([]), 200

    # iTunes first - always has preview URLs that work
    try:
        resp = requests.get(
            'https://itunes.apple.com/search',
            params={'term': query, 'media': 'music', 'limit': 20, 'country': 'us'},
            timeout=5
        )
        if resp.status_code == 200:
            items = resp.json().get('results', [])
            results = []
            for t in items:
                if not t.get('previewUrl'):
                    continue
                results.append({
                    'id': str(t.get('trackId', '')),
                    'uri': f"itunes:track:{t.get('trackId', '')}",
                    'name': t.get('trackName', ''),
                    'album': t.get('collectionName', ''),
                    'image': t.get('artworkUrl100', '').replace('100x100', '300x300'),
                    'artists': [t.get('artistName', '')],
                    'duration_ms': t.get('trackTimeMillis', 0),
                    'preview_url': t.get('previewUrl'),
                    'external_url': t.get('trackViewUrl', ''),
                    'source': 'itunes'
                })
            if results:
                return jsonify(results), 200
    except Exception as e:
        print(f"iTunes search error: {e}")

    # Spotify fallback
    token = get_spotify_token()
    if token:
        try:
            resp = requests.get(
                'https://api.spotify.com/v1/search',
                params={'q': query, 'type': 'track', 'limit': 20},
                headers={'Authorization': f'Bearer {token}'},
                timeout=5
            )
            if resp.status_code == 200:
                items = resp.json().get('tracks', {}).get('items', [])
                results = []
                for t in items:
                    if not t.get('preview_url'):
                        continue
                    album_images = t.get('album', {}).get('images', [])
                    image = album_images[0]['url'] if album_images else None
                    results.append({
                        'id': t['id'],
                        'uri': t['uri'],
                        'name': t['name'],
                        'album': t.get('album', {}).get('name', ''),
                        'image': image,
                        'artists': [a['name'] for a in t.get('artists', [])],
                        'duration_ms': t.get('duration_ms', 0),
                        'preview_url': t.get('preview_url'),
                        'external_url': t.get('external_urls', {}).get('spotify', ''),
                        'source': 'spotify'
                    })
                if results:
                    return jsonify(results), 200
        except Exception as e:
            print(f"Spotify search error: {e}")

    return jsonify([]), 200


# ========== PRIVATE MESSAGES ==========

@app.route('/api/messages/send', methods=['POST'])
def send_message():
    """Enviar un mensaje privado. Requiere auth UPTC."""
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "Debes iniciar sesión para enviar mensajes"}), 401
    try:
        data = request.get_json()
        recipient_id = data.get('recipient_id')
        content = data.get('content', '').strip()
        if not recipient_id or not content:
            return jsonify({"error": "Faltan campos requeridos"}), 400
        sender_email = get_current_user_email()
        if not sender_email:
            return jsonify({"error": "No se pudo identificar al remitente"}), 400
        if sender_email == recipient_id:
            return jsonify({"error": "No puedes enviarte mensajes a ti mismo"}), 400
        conv_key = '_'.join(sorted([sender_email, recipient_id]))
        existing = supabase.table('private_conversations')\
            .select('id')\
            .eq('conversation_key', conv_key)\
            .execute()
        if existing.data:
            conv_id = existing.data[0]['id']
        else:
            conv_result = supabase.table('private_conversations').insert({
                'participant_1': sorted([sender_email, recipient_id])[0],
                'participant_2': sorted([sender_email, recipient_id])[1],
                'conversation_key': conv_key
            }).execute()
            conv_id = conv_result.data[0]['id']
            supabase.table('private_conversations').update({
                'last_message': content,
                'last_message_at': datetime.now(timezone.utc).isoformat(),
                'last_message_by': sender_email
            }).eq('id', conv_id).execute()
        msg_result = supabase.table('private_messages').insert({
            'conversation_id': conv_id,
            'sender_email': sender_email,
            'recipient_email': recipient_id,
            'content': content
        }).execute()
        supabase.table('private_conversations').update({
            'last_message': content,
            'last_message_at': datetime.now(timezone.utc).isoformat(),
            'last_message_by': sender_email
        }).eq('id', conv_id).execute()
        return jsonify({
            "message": msg_result.data[0],
            "conversation_id": conv_id
        }), 201
    except Exception as e:
        print(f"Error sending message: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/messages/conversations', methods=['GET'])
def get_conversations():
    """Listar conversaciones del usuario autenticado."""
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "No autorizado"}), 401
    try:
        user_email = get_current_user_email()
        result = supabase.table('private_conversations')\
            .select('*')\
            .or_(f'participant_1.eq.{user_email},participant_2.eq.{user_email}')\
            .order('last_message_at', desc=True)\
            .execute()
        conversations = []
        for conv in result.data:
            other = conv['participant_2'] if conv['participant_1'] == user_email else conv['participant_1']
            unread = supabase.table('private_messages')\
                .select('id', count='exact')\
                .eq('conversation_id', conv['id'])\
                .eq('sender_email', other)\
                .eq('is_read', False)\
                .execute()
            conversations.append({
                'id': conv['id'],
                'other_user': other,
                'last_message': conv.get('last_message', ''),
                'last_message_at': conv.get('last_message_at'),
                'last_message_by': conv.get('last_message_by'),
                'unread_count': unread.count if unread.count else 0
            })
        return jsonify(conversations), 200
    except Exception as e:
        print(f"Error getting conversations: {e}")
        return jsonify([]), 200


@app.route('/api/messages/<conv_id>', methods=['GET'])
def get_messages(conv_id):
    """Obtener mensajes de una conversación."""
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "No autorizado"}), 401
    try:
        user_email = get_current_user_email()
        conv_check = supabase.table('private_conversations')\
            .select('*')\
            .eq('id', conv_id)\
            .execute()
        if not conv_check.data:
            return jsonify({"error": "Conversación no encontrada"}), 404
        conv = conv_check.data[0]
        if user_email not in (conv['participant_1'], conv['participant_2']):
            return jsonify({"error": "No tienes acceso a esta conversación"}), 403
        messages = supabase.table('private_messages')\
            .select('*')\
            .eq('conversation_id', conv_id)\
            .order('created_at', desc=False)\
            .execute()
        supabase.table('private_messages')\
            .update({'is_read': True})\
            .eq('conversation_id', conv_id)\
            .neq('sender_email', user_email)\
            .eq('is_read', False)\
            .execute()
        return jsonify(messages.data), 200
    except Exception as e:
        print(f"Error getting messages: {e}")
        return jsonify([]), 200


@app.route('/api/messages/unread', methods=['GET'])
def get_unread_count():
    """Contar mensajes no leídos total del usuario."""
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"unread": 0}), 200
    try:
        user_email = get_current_user_email()
        convs = supabase.table('private_conversations')\
            .select('id')\
            .or_(f'participant_1.eq.{user_email},participant_2.eq.{user_email}')\
            .execute()
        total = 0
        for c in convs.data:
            unread = supabase.table('private_messages')\
                .select('id', count='exact')\
                .eq('conversation_id', c['id'])\
                .neq('sender_email', user_email)\
                .eq('is_read', False)\
                .execute()
            total += unread.count if unread.count else 0
        return jsonify({"unread": total}), 200
    except Exception as e:
        print(f"Error getting unread count: {e}")
        return jsonify({"unread": 0}), 200


@app.route('/api/messages/user/<target_email>', methods=['GET'])
def get_or_create_conversation_with_user(target_email):
    """Obtener o crear conversación con un usuario específico (para enviar primer mensaje)."""
    is_authed, _ = verify_uptc_auth()
    if not is_authed:
        return jsonify({"error": "No autorizado"}), 401
    try:
        user_email = get_current_user_email()
        conv_key = '_'.join(sorted([user_email, target_email]))
        existing = supabase.table('private_conversations')\
            .select('id')\
            .eq('conversation_key', conv_key)\
            .execute()
        if existing.data:
            return jsonify({"conversation_id": existing.data[0]['id']}), 200
        conv_result = supabase.table('private_conversations').insert({
            'participant_1': sorted([user_email, target_email])[0],
            'participant_2': sorted([user_email, target_email])[1],
            'conversation_key': conv_key
        }).execute()
        return jsonify({"conversation_id": conv_result.data[0]['id']}), 201
    except Exception as e:
        print(f"Error getting/creating conversation: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
