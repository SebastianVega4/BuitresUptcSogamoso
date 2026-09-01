import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, ChatMessage, ChatStats } from '../../services/chat.service';
import { Observable, Subscription, of, BehaviorSubject } from 'rxjs';
import { take, tap, map } from 'rxjs/operators';

interface MessageGroup {
  label: string;
  messages: ChatMessage[];
}

@Component({
  standalone: true,
  selector: 'app-floating-chat',
  templateUrl: './floating-chat.component.html',
  styleUrls: ['./floating-chat.component.scss'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FloatingChatComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('chatContainer') private chatContainer!: ElementRef<HTMLElement>;

  isChatOpen = false;
  newMessage = '';
  showUserModal = false;
  unreadMessages = 0;
  usernameError: string = '';
  
  // AGREGAR ESTA PROPIEDAD FALTANTE
  private previousMessageCount = 0;
  
  public messages$: Observable<ChatMessage[]>; // Keep original for reference if needed
  public groupedMessages$: Observable<MessageGroup[]>;
  public typingUsers$: Observable<string[]>;
  public onlineUsers$: Observable<number>;
  public connected$: Observable<boolean>;
  public stats$: Observable<ChatStats | null>;
  public currentUser$: Observable<string>;
  private isAdminSubject = new BehaviorSubject<boolean>(false);
  public isAdmin$ = this.isAdminSubject.asObservable();

  private subscriptions = new Subscription();
  private typingTimeout: any;

  constructor(
    public chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef
  ) {
    this.messages$ = this.chatService.messages$;
    this.typingUsers$ = this.chatService.typingUsers$;
    this.onlineUsers$ = this.chatService.onlineUsers$;
    this.connected$ = this.chatService.connected$;
    this.stats$ = this.chatService.stats$;
    this.currentUser$ = of(this.chatService.getUser());
    this.connected$ = this.chatService.connected$;
    this.stats$ = this.chatService.stats$;
    this.currentUser$ = of(this.chatService.getUser());
    this.isAdminSubject.next(this.chatService.isAdmin());
    
    // Transformar mensajes planos a agrupados por fecha
    this.groupedMessages$ = this.messages$.pipe(
      map(messages => this.groupMessagesByDate(messages))
    );
  }

  ngOnInit(): void {
    const messagesSub = this.messages$.subscribe(messages => {
        // Usar setTimeout para evitar ExpressionChangedAfterItHasBeenCheckedError
        setTimeout(() => {
            this.handleNewMessages(messages);
            this.cdr.detectChanges();
            this.autoScrollToBottom();
        });
    });
    this.subscriptions.add(messagesSub);

    // Forzar una verificación inicial de mensajes
    setTimeout(() => {
      this.chatService.loadInitialHistory().subscribe();
    }, 1000);
  }

  onUsernameInput(username: string): void {
    const trimmed = username.trim();
    if (trimmed) {
      this.chatService.validateUsername(trimmed).subscribe({
        next: (validation) => {
          this.usernameError = validation.valid ? '' : (validation.error || '');
          this.cdr.markForCheck();
        },
        error: () => {
          this.usernameError = '';
          this.cdr.markForCheck();
        }
      });
    } else {
      this.usernameError = '';
      this.cdr.markForCheck();
    }
  }
  
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }
  
  private handleNewMessages(messages: ChatMessage[]): void {
    if (!this.messagesContainer) return;

    const currentCount = messages.length;
    const previousCount = this.previousMessageCount;
    this.previousMessageCount = currentCount;

    if (this.isChatOpen) {
      // Si el chat está abierto, solo actualizar el contador de no leídos si hay nuevos mensajes
      const newMessagesCount = currentCount - previousCount;
      if (newMessagesCount > 0 && previousCount > 0) {
        this.unreadMessages += newMessagesCount;
      }
    } else {
      // Si el chat está cerrado, contar todos los mensajes nuevos
      const newMessagesCount = currentCount - previousCount;
      if (newMessagesCount > 0) {
        this.unreadMessages += newMessagesCount;
        this.showNewMessageNotification(this.unreadMessages);
      }
    }
  }

  sendMessage(): void {
    this.connected$.pipe(take(1)).subscribe(isConnected => {
      if (this.newMessage.trim() && isConnected) {
        const messageText = this.newMessage.trim();
        this.newMessage = '';
        this.cdr.markForCheck();
  
        this.chatService.sendMessage(messageText).subscribe({
          next: () => {
            this.stopTyping();
            this.scrollToBottom();
          },
          error: (error) => {
            // Restore message on error
            this.newMessage = messageText;
            this.cdr.markForCheck();
            
            // Mostrar error específico si es de validación de nombre
            if (error.error && error.error.error) {
              alert(error.error.error);
            }
          }
        });
      } 
    });
  }

  scrollToBottom(): void {
    if(this.messagesContainer) {
        setTimeout(() => {
          try {
            this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
          } catch (error) {
            console.error('Error en scroll:', error);
          }
        }, 50);
    }
  }

  private showNewMessageNotification(count: number): void {
    if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`Tienes ${count} nuevo${count > 1 ? 's' : ''} mensaje${count > 1 ? 's' : ''}`);
    }
  }

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      this.unreadMessages = 0;
      this.chatService.loadStats(); // Refresh stats on open
      this.chatService.refreshOnlineUsers().subscribe(); // Refresh online users on open
      
      // Forzar actualización de mensajes al abrir el chat
      setTimeout(() => {
        this.scrollToBottom();
        this.chatService.loadInitialHistory().subscribe();
      }, 100);
    }
  }
  
  private setupRealtimeMessages(): void {
    const messagesSub = this.messages$.subscribe(messages => {
      const wasNearBottom = this.isNearBottom();
      
      this.handleNewMessages(messages);
      this.cdr.markForCheck();
      
      // Solo hacer scroll automático si ya estaba cerca del fondo
      if (wasNearBottom) {
        this.autoScrollToBottom();
      }
    });
    this.subscriptions.add(messagesSub);
  }
  
  private isNearBottom(): boolean {
    if (!this.messagesContainer) return true;
    
    const el = this.messagesContainer.nativeElement;
    const threshold = 150; // píxeles desde el fondo
    const position = el.scrollTop + el.clientHeight;
    const height = el.scrollHeight;
    
    return height - position <= threshold;
  }
  
  private autoScrollToBottom(): void {
    if (this.messagesContainer) {
      setTimeout(() => {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }, 100);
    }
  }

  onInputChange(): void {
    this.connected$.pipe(take(1)).subscribe(isConnected => {
      if (this.newMessage.trim() && isConnected) {
        this.chatService.setTyping(true);
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => this.stopTyping(), 2500);
      } else {
        this.stopTyping();
      }
    });
  }

  stopTyping(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    this.chatService.setTyping(false);
  }

  updateUser(newUsername: string): void {
    const trimmed = newUsername.trim();
    if (trimmed) {
      this.chatService.validateUsername(trimmed).subscribe({
        next: (validation) => {
          if (validation.valid) {
            this.chatService.setUser(trimmed);
            this.currentUser$ = of(trimmed);
            this.showUserModal = false;
            this.usernameError = '';
            this.cdr.markForCheck();
            
            // Mostrar mensaje de éxito si es admin
            if (validation.is_admin) {
              console.log('✅ Modo administrador activado para el chat');
              this.isAdminSubject.next(true);
            } else {
              this.isAdminSubject.next(this.chatService.isAdmin());
            }
          } else {
            this.usernameError = validation.error || 'Nombre no válido';
            this.cdr.markForCheck();
          }
        },
        error: () => {
          this.usernameError = 'Error validando el nombre de usuario';
          this.cdr.markForCheck();
        }
      });
    }
  }

  formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  trackByMessage(index: number, message: ChatMessage): string {
    return message.id;
  }
  
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Use ElementRef for safer, more Angular-friendly DOM checking
    if (this.isChatOpen && !this.elementRef.nativeElement.contains(event.target)) {
        this.isChatOpen = false;
        this.cdr.markForCheck();
    }
  }

  deleteMessage(messageId: string): void {
    if (confirm('¿Estás seguro de que quieres eliminar este mensaje?')) {
      this.chatService.deleteMessage(messageId).subscribe({
        next: () => {
          // El mensaje se eliminará de la lista automáticamente gracias al Realtime
        },
        error: (error) => {
          console.error('Error al eliminar mensaje:', error);
          alert('No se pudo eliminar el mensaje');
        }
      });
    }
  }

  private groupMessagesByDate(messages: ChatMessage[]): MessageGroup[] {
    const groups: MessageGroup[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    messages.forEach(msg => {
      const msgDate = new Date(msg.timestamp);
      const msgDateOnly = new Date(msgDate);
      msgDateOnly.setHours(0, 0, 0, 0);

      let label = '';
      if (msgDateOnly.getTime() === today.getTime()) {
        label = 'Hoy';
      } else if (msgDateOnly.getTime() === yesterday.getTime()) {
        label = 'Ayer';
      } else {
        label = msgDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }

      // Buscar si ya existe el grupo (usando el último grupo para mantener orden cronológico)
      let lastGroup = groups[groups.length - 1];
      
      if (lastGroup && lastGroup.label === label) {
        lastGroup.messages.push(msg);
      } else {
        groups.push({ label, messages: [msg] });
      }
    });

    return groups;
  }
}