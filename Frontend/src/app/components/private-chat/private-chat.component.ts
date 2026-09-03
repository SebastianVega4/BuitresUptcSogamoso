import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService, Conversation, Message } from '../../services/message.service';
import { AuthService } from '../../services/auth';
import { BuitresService, BuitrePerson } from '../../services/buitres.service';
import {
  SupabaseRealtimeService,
  RealtimeMessage
} from '../../services/supabase-realtime.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Subscription, Subject, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  selector: 'app-private-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './private-chat.component.html',
  styleUrls: ['./private-chat.component.scss']
})
export class PrivateChatComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  isOpen = false;
  activeConversation: string | null = null;
  conversations: Conversation[] = [];
  messages: Message[] = [];
  newMessage = '';
  currentEmail = '';
  currentUserName = '';

  searchQuery = '';
  searchResults: BuitrePerson[] = [];
  isSearching = false;
  showSearchResults = false;

  private unreadSub?: Subscription;
  private msgChannel?: RealtimeChannel;
  private searchSubject = new Subject<string>();

  constructor(
    private messageService: MessageService,
    private realtime: SupabaseRealtimeService,
    private buitresService: BuitresService,
    public authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const userData = localStorage.getItem('buitresUser') || localStorage.getItem('adminUser');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        this.currentEmail = user.email || '';
        this.currentUserName = user.name || user.email || '';
      } catch (e) {}
    }

    this.unreadSub = this.messageService.unreadCount$.subscribe(() => {});

    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      if (!query.trim()) {
        this.searchResults = [];
        this.isSearching = false;
        return;
      }
      this.buitresService.getPeople(query, 'recent').subscribe({
        next: (results) => {
          this.searchResults = results.filter(p => p.email && p.email !== this.currentEmail);
          this.isSearching = false;
        },
        error: () => {
          this.searchResults = [];
          this.isSearching = false;
        }
      });
    });

    if (this.isLoggedIn) {
      this.messageService.startRealtimeSubscriptions();
      this.loadConversations();
    }
  }

  ngOnDestroy() {
    this.unreadSub?.unsubscribe();
    if (this.msgChannel) this.realtime.unsubscribe(this.msgChannel);
  }

  get isLoggedIn(): boolean {
    return this.authService.isBuitresLoggedIn();
  }

  get unreadCount(): number {
    return this.messageService['unreadCountSubject'].value;
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.loadConversations();
      this.messageService.setActiveConversation(null);
    } else {
      this.messageService.setActiveConversation(null);
    }
  }

  onSearchInput() {
    this.showSearchResults = true;
    this.isSearching = true;
    this.searchSubject.next(this.searchQuery);
  }

  selectSearchResult(person: BuitrePerson) {
    const email = person.email;
    if (!email) return;
    this.showSearchResults = false;
    this.searchQuery = '';
    this.isSearching = false;
    this.messageService.getOrCreateConversation(email).subscribe({
      next: (res) => {
        this.openConversation(res.conversation_id);
        this.loadConversations();
        this.searchQuery = '';
        this.searchResults = [];
      }
    });
  }

  hideSearchResults() {
    setTimeout(() => {
      this.showSearchResults = false;
    }, 200);
  }

  loadConversations() {
    if (!this.isLoggedIn) return;
    this.messageService.getConversations().subscribe({
      next: (data) => this.conversations = data,
      error: () => this.conversations = []
    });
  }

  openConversation(conversationId: string) {
    this.activeConversation = conversationId;
    this.messageService.setActiveConversation(conversationId);
    this.loadMessages(conversationId);
    this.subscribeToConversation(conversationId);

    const conv = this.conversations.find(c => c.id === conversationId);
    if (conv && conv.unread_count > 0) {
      conv.unread_count = 0;
      this.messageService.refreshUnreadCount();
    }
  }

  loadMessages(conversationId: string) {
    this.messageService.getMessages(conversationId).subscribe({
      next: (data) => {
        this.messages = data;
        setTimeout(() => this.scrollToBottom(), 50);
      },
      error: () => this.messages = []
    });
  }

  subscribeToConversation(conversationId: string) {
    if (this.msgChannel) this.realtime.unsubscribe(this.msgChannel);

    this.msgChannel = this.realtime.subscribeToMessages(
      conversationId,
      (msg: RealtimeMessage) => {
        if (this.activeConversation === conversationId) {
          const exists = this.messages.find(m => m.id === msg.id);
          if (!exists) {
            this.messages.push(msg as Message);
            setTimeout(() => this.scrollToBottom(), 50);
          }
        }
      },
      (msg: RealtimeMessage) => {
        const idx = this.messages.findIndex(m => m.id === msg.id);
        if (idx >= 0) {
          this.messages[idx] = msg as Message;
        }
      }
    );
  }

  sendMessage() {
    if (!this.newMessage.trim() || !this.activeConversation) return;
    const conv = this.conversations.find(c => c.id === this.activeConversation);
    if (!conv) return;

    this.messageService.sendMessage(conv.other_user, this.newMessage.trim()).subscribe({
      next: () => {
        this.newMessage = '';
      },
      error: (err) => console.error('Error sending message:', err)
    });
  }

  goBack() {
    this.activeConversation = null;
    this.messages = [];
    this.messageService.setActiveConversation(null);
    if (this.msgChannel) {
      this.realtime.unsubscribe(this.msgChannel);
      this.msgChannel = undefined;
    }
    this.loadConversations();
  }

  getConversationLabel(conv: Conversation): string {
    if (conv.other_user === this.currentEmail) return 'Desconocido';
    return conv.other_user;
  }

  getSenderLabel(msg: Message): string {
    if (msg.sender_email === this.currentEmail) return 'Tú';
    const initiatorEmail = this.getInitiatorEmail();
    if (this.currentEmail === initiatorEmail) {
      return msg.sender_email;
    }
    return 'Anónimo';
  }

  private getInitiatorEmail(): string {
    if (this.messages.length === 0) return '';
    const firstMsg = this.messages[0];
    return firstMsg.sender_email;
  }

  isMyMessage(msg: Message): boolean {
    return msg.sender_email === this.currentEmail;
  }

  goToProfile(email: string) {
    if (!email) return;
    this.router.navigate(['/buitres']);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  private scrollToBottom() {
    if (this.messagesContainer) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
