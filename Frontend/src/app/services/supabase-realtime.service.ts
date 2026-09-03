import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }
  return supabaseInstance;
}

export interface RealtimeMessage {
  id: string;
  conversation_id: string;
  sender_email: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface RealtimeConversation {
  id: string;
  participant_1: string;
  participant_2: string;
  conversation_key: string;
  last_message: string;
  last_message_at: string;
  last_message_by: string;
}

export class SupabaseRealtimeService {
  private channels: RealtimeChannel[] = [];

  subscribeToMessages(
    conversationId: string,
    onInsert: (msg: RealtimeMessage) => void,
    onUpdate?: (msg: RealtimeMessage) => void
  ): RealtimeChannel {
    const supabase = getSupabase();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          onInsert(payload.new as RealtimeMessage);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          if (onUpdate) onUpdate(payload.new as RealtimeMessage);
        }
      )
      .subscribe();

    this.channels.push(channel);
    return channel;
  }

  subscribeToConversations(
    userEmail: string,
    onInsert: (conv: RealtimeConversation) => void,
    onUpdate: (conv: RealtimeConversation) => void
  ): RealtimeChannel {
    const supabase = getSupabase();
    const channel = supabase
      .channel('conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'private_conversations'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            onInsert(payload.new as RealtimeConversation);
          } else if (payload.eventType === 'UPDATE') {
            onUpdate(payload.new as RealtimeConversation);
          }
        }
      )
      .subscribe();

    this.channels.push(channel);
    return channel;
  }

  subscribeToUnreadMessages(
    userEmail: string,
    onNewMessage: (msg: RealtimeMessage) => void
  ): RealtimeChannel {
    const supabase = getSupabase();
    const channel = supabase
      .channel(`unread:${userEmail}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages'
        },
        (payload) => {
          const msg = payload.new as RealtimeMessage;
          if (msg.sender_email !== userEmail) {
            onNewMessage(msg);
          }
        }
      )
      .subscribe();

    this.channels.push(channel);
    return channel;
  }

  unsubscribeAll(): void {
    this.channels.forEach(ch => {
      const supabase = getSupabase();
      supabase.removeChannel(ch);
    });
    this.channels = [];
  }

  unsubscribe(channel: RealtimeChannel): void {
    const supabase = getSupabase();
    supabase.removeChannel(channel);
    this.channels = this.channels.filter(c => c !== channel);
  }
}

export const realtimeService = new SupabaseRealtimeService();
