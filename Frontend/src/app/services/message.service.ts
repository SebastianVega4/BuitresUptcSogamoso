import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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

  constructor(private http: HttpClient) {}

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
}
