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
  initiator_email: string;
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
  private notificationAudio: HTMLAudioElement | null = null;

  constructor(
    private http: HttpClient,
    private realtime: SupabaseRealtimeService
  ) {
    this.loadUserEmail();
    this.initNotificationSound();
  }

  private initNotificationSound() {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const duration = 0.15;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
    audioCtx.close();
  }

  playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1000;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.8, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1300;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.6, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc2.start(ctx.currentTime + 0.1);
      osc2.stop(ctx.currentTime + 0.3);
      setTimeout(() => ctx.close(), 500);
    } catch (e) {}
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

  sendMessage(conversationId: string, content: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/messages/send`, {
      conversation_id: conversationId,
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
        this.playNotificationSound();
      }
    });

    this.refreshUnreadCount();
  }

  stopRealtimeSubscriptions() {
    this.realtime.unsubscribeAll();
  }
}
