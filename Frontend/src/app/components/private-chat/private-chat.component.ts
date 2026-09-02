import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService, Conversation, Message } from '../../services/message.service';
import { AuthService } from '../../services/auth';
import { Subscription, interval } from 'rxjs';

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
  targetEmail = '';
  isCreatingConversation = false;
  private refreshSub?: Subscription;
  currentEmail = '';

  constructor(
    private messageService: MessageService,
    public authService: AuthService
  ) {}

  ngOnInit() {
    const user = this.authService.getBuitresUser();
    this.currentEmail = user?.email || '';
    this.loadConversations();
    this.refreshSub = interval(5000).subscribe(() => {
      if (this.isOpen) {
        this.loadConversations();
        if (this.activeConversation) {
          this.loadMessages(this.activeConversation);
        }
      }
    });
    window.addEventListener('open-private-chat', this.handleOpenChat.bind(this));
  }

  ngOnDestroy() {
    this.refreshSub?.unsubscribe();
    window.removeEventListener('open-private-chat', this.handleOpenChat.bind(this));
  }

  private handleOpenChat(event: Event) {
    const customEvent = event as CustomEvent;
    const conversationId = customEvent.detail?.conversationId;
    if (conversationId) {
      this.isOpen = true;
      this.loadConversations();
      this.openConversation(conversationId);
    }
  }

  get isLoggedIn(): boolean {
    return this.authService.isBuitresLoggedIn();
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.loadConversations();
    }
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
    this.loadMessages(conversationId);
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

  sendMessage() {
    if (!this.newMessage.trim() || !this.activeConversation) return;
    const conv = this.conversations.find(c => c.id === this.activeConversation);
    if (!conv) return;
    this.messageService.sendMessage(conv.other_user, this.newMessage.trim()).subscribe({
      next: () => {
        this.newMessage = '';
        this.loadMessages(this.activeConversation!);
        this.loadConversations();
      },
      error: (err) => console.error('Error sending message:', err)
    });
  }

  startNewConversation() {
    if (!this.targetEmail.trim()) return;
    this.isCreatingConversation = true;
    this.messageService.getOrCreateConversation(this.targetEmail.trim()).subscribe({
      next: (res) => {
        this.isCreatingConversation = false;
        this.targetEmail = '';
        this.openConversation(res.conversation_id);
        this.loadConversations();
      },
      error: () => {
        this.isCreatingConversation = false;
      }
    });
  }

  goBack() {
    this.activeConversation = null;
    this.messages = [];
  }

  getOtherEmail(conv: Conversation): string {
    return conv.other_user;
  }

  isMyMessage(msg: Message): boolean {
    return msg.sender_email === this.currentEmail;
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
