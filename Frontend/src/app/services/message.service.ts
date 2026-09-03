import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  SupabaseRealtimeService,
  RealtimeMessage,
  RealtimeConversation
} from './supabase-realtime.service';

export interface Conversation {
  id: string;
  other_user: string;
  last_message: string;
  last_message_at: string;
  last_message_by: string;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_email: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private apiUrl = environment.apiUrl;

  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  private activeConversationId: string | null = null;
  private currentEmail: string = '';

  constructor(
    private http: HttpClient,
    private realtime: SupabaseRealtimeService
  ) {
    this.loadUserEmail();
  }

  private loadUserEmail() {
    const userData = localStorage.getItem('buitresUser') || localStorage.getItem('adminUser');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        this.currentEmail = user.email || '';
      } catch (e) {}
    }
  }

  private getHeaders(): { [key: string]: string } {
    const token = localStorage.getItem('buitresToken') || localStorage.getItem('adminToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  getConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.apiUrl}/api/messages/conversations`, {
      headers: this.getHeaders()
    });
  }

  getMessages(conversationId: string): Observable<Message[]> {
    return this.http.get<Message[]>(`${this.apiUrl}/api/messages/${conversationId}`, {
      headers: this.getHeaders()
    });
  }

  sendMessage(recipientId: string, content: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/messages/send`, {
      recipient_id: recipientId,
      content
    }, { headers: this.getHeaders() });
  }

  getOrCreateConversation(targetEmail: string): Observable<{ conversation_id: string }> {
    return this.http.get<{ conversation_id: string }>(`${this.apiUrl}/api/messages/user/${targetEmail}`, {
      headers: this.getHeaders()
    });
  }

  getUnreadCount(): Observable<{ unread: number }> {
    return this.http.get<{ unread: number }>(`${this.apiUrl}/api/messages/unread`, {
      headers: this.getHeaders()
    });
  }

  refreshUnreadCount() {
    if (!this.currentEmail) this.loadUserEmail();
    if (!this.currentEmail) return;
    this.getUnreadCount().subscribe({
      next: (res) => this.unreadCountSubject.next(res.unread),
      error: () => {}
    });
  }

  setActiveConversation(conversationId: string | null) {
    this.activeConversationId = conversationId;
  }

  startRealtimeSubscriptions() {
    if (!this.currentEmail) this.loadUserEmail();
    if (!this.currentEmail) return;

    this.realtime.subscribeToUnreadMessages(this.currentEmail, (msg) => {
      if (msg.conversation_id !== this.activeConversationId) {
        this.unreadCountSubject.next(this.unreadCountSubject.value + 1);
      }
    });

    this.refreshUnreadCount();
  }

  stopRealtimeSubscriptions() {
    this.realtime.unsubscribeAll();
  }
}
