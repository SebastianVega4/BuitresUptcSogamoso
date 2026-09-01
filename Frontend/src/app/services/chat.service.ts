import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, Subscription } from 'rxjs';
import { map, tap, catchError, distinctUntilChanged } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { createClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface ChatMessage {
  id: string;
  user: string;
  user_id: string;
  message: string;
  timestamp: string;
  room: string;
  type: 'message' | 'system';
}

export interface ChatStats {
  total_messages: number;
  messages_today: number;
  online_users: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService implements OnDestroy {
  private apiUrl = environment.apiUrl;
  private supabase;
  private channel: RealtimeChannel | null = null;

  // Subjects for reactive state
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private typingUsersSubject = new BehaviorSubject<string[]>([]);
  public typingUsers$ = this.typingUsersSubject.asObservable();

  private statsSubject = new BehaviorSubject<ChatStats | null>(null);
  public stats$ = this.statsSubject.asObservable();

  private connectedSubject = new BehaviorSubject<boolean>(true);
  public connected$ = this.connectedSubject.asObservable();

  private onlineUsersSubject = new BehaviorSubject<number>(1);
  public onlineUsers$ = this.onlineUsersSubject.asObservable();

  // User state
  private currentUser: string = 'Usuario';
  private userId: string = this.generateUserId();
  private currentRoom: string = 'general';
  private isTyping: boolean = false;

  // Subscriptions management
  private subscriptions: Subscription[] = [];

  constructor(private http: HttpClient) {
    // Configurar Supabase Client con Realtime - DESHABILITANDO LockManager
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey,
      {
        auth: {
          // Esto evita el error del LockManager
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: localStorage, // Usar localStorage en lugar de LockManager
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      }
    );
    this.loadUserFromStorage();
    this.loadInitialHistory().subscribe(() => {
      this.setupRealtimeSubscription();
    });

    this.subscriptions.push(
      this.setupPeriodicStats(),
      this.setupOnlineUsersCheck(),
      this.setupHeartbeat()
    );
  }

  ngOnDestroy(): void {
    // Clean up all subscriptions and realtime connection
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.setTyping(false);

    // Desconectar canal de Supabase Realtime
    if (this.channel) {
      this.supabase.removeChannel(this.channel);
    }
  }

  private setupRealtimeSubscription(): void {
    // Configurar suscripción a cambios en tiempo real
    this.channel = this.supabase
      .channel('chat-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room=eq.${this.currentRoom}`
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          this.handleNewMessage(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `message_type=eq.system`
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          this.handleSystemMessage(payload);
        }
      )
      .subscribe((status) => {
        console.log('Canal de Supabase:', status);
        this.connectedSubject.next(status === 'SUBSCRIBED');
      });
  }

  private handleNewMessage(payload: RealtimePostgresChangesPayload<any>): void {
    const newMessage: ChatMessage = {
      id: payload.new.id,
      user: payload.new.user_name,
      user_id: payload.new.user_id,
      message: payload.new.message,
      timestamp: payload.new.created_at,
      room: payload.new.room,
      type: payload.new.message_type || 'message'
    };

    // Verificar que no sea un mensaje duplicado
    const currentMessages = this.messagesSubject.value;
    if (!currentMessages.find(msg => msg.id === newMessage.id)) {
      const updatedMessages = [...currentMessages, newMessage]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Mantener solo los últimos 200 mensajes
      const limitedMessages = updatedMessages.slice(-200);
      this.messagesSubject.next(limitedMessages);
    }
  }

  private getAuthToken(): string | null {
    // Buscar primero el token de admin, luego el genérico
    return localStorage.getItem('adminToken') || localStorage.getItem('auth_token');
  }

  private handleSystemMessage(payload: RealtimePostgresChangesPayload<any>): void {
    // Manejar mensajes del sistema (usuarios conectados/desconectados, etc.)
    this.handleNewMessage(payload);
  }

  private setupPeriodicStats(): Subscription {
    // Actualizar stats cada 60 segundos
    return new Subscription(() => {
      const interval = setInterval(() => {
        this.loadStatsObservable().subscribe();
      }, 60000);

      return () => clearInterval(interval);
    });
  }

  private setupOnlineUsersCheck(): Subscription {
    // Verificar usuarios online cada 60 segundos
    return new Subscription(() => {
      // Check inicial
      this.refreshOnlineUsers().subscribe();
      
      const interval = setInterval(() => {
        this.refreshOnlineUsers().subscribe();
      }, 60000);

      return () => clearInterval(interval);
    });
  }

  private setupHeartbeat(): Subscription {
    // Enviar latido cada 60 segundos
    return new Subscription(() => {
        // Enviar inicial
        this.sendHeartbeat().subscribe();
        
        const interval = setInterval(() => {
            this.sendHeartbeat().subscribe();
        }, 60000);

        return () => clearInterval(interval);
    });
  }

  private sendHeartbeat(): Observable<any> {
    const token = this.getAuthToken();
    const headers: {[key: string]: string} = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return this.http.post(`${this.apiUrl}/api/chat/heartbeat`, {
      user_id: this.userId,
      room: this.currentRoom
    }, { headers }).pipe(
      catchError(() => of(null))
    );
  }

  private loadUserFromStorage(): void {
    const storedUser = localStorage.getItem('chat_user_name');
    if (storedUser) {
      this.currentUser = storedUser;
    }
  }

  public loadInitialHistory(): Observable<any> {
    return this.http.get<{ messages: ChatMessage[] }>(`${this.apiUrl}/api/chat/messages?limit=100`).pipe(
      tap({
        next: (response) => {
          const messages = response.messages || [];
          this.messagesSubject.next(messages);
          this.connectedSubject.next(true);
        },
        error: (error) => {
          console.error('Error loading initial history:', error);
          this.connectedSubject.next(false);
        }
      }),
      catchError(error => {
        console.error('API call failed for initial history:', error);
        this.connectedSubject.next(false);
        return of(null);
      })
    );
  }

  public refreshOnlineUsers(): Observable<any> {
    return this.http.get<{ online_users: number }>(`${this.apiUrl}/api/chat/online-users`).pipe(
      catchError(error => of({ online_users: 1 })),
      tap(response => this.onlineUsersSubject.next(response.online_users))
    );
  }

  sendMessage(message: string): Observable<any> {
    const token = this.getAuthToken();
    const headers: {[key: string]: string} = {
      'Content-Type': 'application/json'
    };
    
    // SIEMPRE enviar el token si está disponible
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  
    const messageData = {
      message: message.trim(),
      user: this.currentUser,
      user_id: this.userId,
      room: this.currentRoom
    };
  
    return this.http.post<{ success: boolean, message: ChatMessage }>(
      `${this.apiUrl}/api/chat/send`,
      messageData,
      { headers }
    ).pipe(
      tap(response => {
        if (response.success && response.message) {
          this.setTyping(false);
        }
      })
    );
  }

  deleteMessage(messageId: string): Observable<any> {
    const token = this.getAuthToken();
    const headers: { [key: string]: string } = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return this.http.delete(`${this.apiUrl}/api/chat/messages/${messageId}`, { headers });
  }

  isAdmin(): boolean {
    const token = this.getAuthToken();
    if (!token) return false;

    const userData = localStorage.getItem('adminUser');
    if (!userData) return !!token; 

    try {
      const user = JSON.parse(userData);
      return user.role === 'admin';
    } catch (e) {
      return !!token;
    }
  }

  setTyping(isTyping: boolean): void {
    if (this.isTyping === isTyping) return;
    this.isTyping = isTyping;

    this.http.post(`${this.apiUrl}/api/chat/typing`, {
      user: this.currentUser,
      room: this.currentRoom,
      is_typing: isTyping
    }).pipe(catchError(() => of(null))).subscribe();
  }

  setUser(name: string): void {
    if (name && name.trim()) {
      this.currentUser = name.trim();
      localStorage.setItem('chat_user_name', this.currentUser);
    }
  }

  getUser(): string {
    return this.currentUser;
  }

  private loadStatsObservable(): Observable<ChatStats | null> {
    return this.http.get<ChatStats>(`${this.apiUrl}/api/chat/stats`).pipe(
      catchError(() => of(null)),
      tap(stats => {
        if (stats) this.statsSubject.next(stats);
      })
    );
  }

  loadStats(): void {
    this.loadStatsObservable().subscribe();
  }

  validateUsername(username: string): Observable<{ valid: boolean, error?: string, is_admin?: boolean }> {
    const token = this.getAuthToken();
    console.log('[ChatService] Validating username. Token exists:', !!token);
    
    const headers: { [key: string]: string } = {
      'Content-Type': 'application/json'
    };
  
    // SIEMPRE enviar el token si está disponible
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  
    return this.http.post<{ valid: boolean, error?: string, is_admin?: boolean }>(
      `${this.apiUrl}/api/chat/validate-username`,
      { username },
      { headers }
    ).pipe(
      catchError(error => of({ valid: false, error: 'Error validando nombre' }))
    );
  }

  private generateUserId(): string {
    let userId = localStorage.getItem('chat_user_id');
    if (!userId) {
      userId = `user_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem('chat_user_id', userId);
    }
    return userId;
  }
}