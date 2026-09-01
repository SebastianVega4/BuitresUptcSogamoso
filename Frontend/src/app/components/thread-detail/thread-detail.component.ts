import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DiscussionService, Thread, ThreadComment } from '../../services/discussion.service';
import { MetaService } from '../../services/meta.service';
import { AuthService } from '../../services/auth';
import { tap } from 'rxjs/operators';

@Component({
  standalone: true,
  selector: 'app-thread-detail',
  templateUrl: './thread-detail.component.html',
  styleUrls: ['./thread-detail.component.scss'],
  imports: [CommonModule, FormsModule, RouterModule]
})
export class ThreadDetailComponent implements OnInit {
  thread!: Thread;
  comments: ThreadComment[] = [];
  newComment = '';
  replyingTo: string | null = null;
  replyContent = '';
  error: string | null = null;
  isLoading = true;
  
  // Admin & Editing State
  isAdmin = false;
  isEditingThread = false;
  editedThreadTitle = '';
  editedThreadContent = '';
  editingCommentId: string | null = null;
  editedCommentContent = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private discussionService: DiscussionService,
    private metaService: MetaService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.checkAdminStatus();
    const threadId = this.route.snapshot.paramMap.get('id');
    if (threadId) {
      this.loadThread(threadId);
    }
  }

  checkAdminStatus() {
    this.isAdmin = this.authService.isRoleAdmin();
  }

  // ... existing loadThread ...

  // Admin Actions - Thread
  deleteThread() {
    if (!confirm('¿Estás seguro de que quieres eliminar este hilo y todos sus comentarios? Esta acción no se puede deshacer.')) return;
    
    this.discussionService.deleteThread(this.thread.id).subscribe({
      next: () => {
        this.router.navigate(['/discussion']);
      },
      error: (error) => {
        console.error('Error deleting thread:', error);
        alert('Error al eliminar el hilo');
      }
    });
  }

  startEditThread() {
    this.isEditingThread = true;
    this.editedThreadTitle = this.thread.title;
    this.editedThreadContent = this.thread.content;
  }

  cancelEditThread() {
    this.isEditingThread = false;
    this.editedThreadTitle = '';
    this.editedThreadContent = '';
  }

  saveThread() {
    if (!this.editedThreadContent.trim()) return;
    
    this.discussionService.updateThread(this.thread.id, {
      title: this.editedThreadTitle,
      content: this.editedThreadContent
    }).subscribe({
      next: () => {
        this.thread.title = this.editedThreadTitle;
        this.thread.content = this.editedThreadContent;
        this.isEditingThread = false;
      },
      error: (error) => {
        console.error('Error updating thread:', error);
        alert('Error al actualizar el hilo');
      }
    });
  }

  // Admin Actions - Comments
  deleteComment(comment: ThreadComment) {
    if (!confirm('¿Estás seguro de que quieres eliminar este comentario?')) return;
    
    this.discussionService.deleteComment(comment.id).subscribe({
      next: () => {
        this.removeCommentFromList(comment.id);
        this.thread.comments_count--;
      },
      error: (error) => {
        console.error('Error deleting comment:', error);
        alert('Error al eliminar el comentario');
      }
    });
  }

  removeCommentFromList(commentId: string) {
    // Remove from main list
    this.comments = this.comments.filter(c => c.id !== commentId);
    
    // Remove from replies
    this.comments.forEach(c => {
      if (c.replies) {
        c.replies = c.replies.filter(r => r.id !== commentId);
      }
    });
  }

  startEditComment(comment: ThreadComment) {
    this.editingCommentId = comment.id;
    this.editedCommentContent = comment.content;
  }

  cancelEditComment() {
    this.editingCommentId = null;
    this.editedCommentContent = '';
  }

  saveComment(comment: ThreadComment) {
    if (!this.editedCommentContent.trim()) return;
    
    this.discussionService.updateComment(comment.id, this.editedCommentContent).subscribe({
      next: () => {
        comment.content = this.editedCommentContent;
        this.editingCommentId = null;
      },
      error: (error) => {
        console.error('Error updating comment:', error);
        alert('Error al actualizar el comentario');
      }
    });
  }

  // ... rest of existing methods ...

  loadThread(threadId: string) {
    this.isLoading = true;
    this.error = null;
    
    this.discussionService.getThread(threadId).subscribe({
      next: (data) => {
        this.thread = {
          ...data.thread,
          user_has_liked: this.discussionService.hasUserLiked('thread', data.thread.id)
        };
        
        this.metaService.updatePageData(this.thread.title, this.thread.content.substring(0, 150) + '...');
        
        // Procesar comentarios con información de likes del usuario
        this.comments = this.buildCommentTree(data.comments).map(comment => ({
          ...comment,
          user_has_liked: this.discussionService.hasUserLiked('comment', comment.id),
          replies: comment.replies?.map(reply => ({
            ...reply,
            user_has_liked: this.discussionService.hasUserLiked('comment', reply.id)
          }))
        }));
        
        this.isLoading = false;
        this.error = null;
      },
      error: (error) => {
        console.error('Error loading thread:', error);
        this.error = 'No se pudo cargar el hilo. Por favor, intenta nuevamente.';
        this.isLoading = false;
      }
    });
  }

  buildCommentTree(comments: ThreadComment[]): ThreadComment[] {
    const commentMap = new Map();
    const roots: ThreadComment[] = [];

    comments.forEach(comment => {
      comment.replies = [];
      commentMap.set(comment.id, comment);
    });

    comments.forEach(comment => {
      if (comment.parent_comment_id) {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) {
          parent.replies!.push(comment);
        }
      } else {
        roots.push(comment);
      }
    });

    return roots;
  }

  addComment() {
    if (!this.newComment.trim()) return;

    this.discussionService.addComment(this.thread.id, this.newComment).subscribe({
      next: (comment) => {
        const newCommentWithLike = {
          ...comment,
          user_has_liked: false,
          replies: []
        };
        this.comments.push(newCommentWithLike);
        this.newComment = '';
        this.thread.comments_count++;
        this.error = null;
      },
      error: (error) => {
        console.error('Error adding comment:', error);
        this.error = 'Error al agregar el comentario. Por favor, intenta nuevamente.';
      }
    });
  }

  addReply() {
    if (!this.replyContent.trim() || !this.replyingTo) return;

    this.discussionService.addComment(this.thread.id, this.replyContent, this.replyingTo).subscribe({
      next: (comment) => {
        const parentComment = this.findCommentById(this.replyingTo!);
        if (parentComment) {
          if (!parentComment.replies) {
            parentComment.replies = [];
          }
          const newReply = {
            ...comment,
            user_has_liked: false
          };
          parentComment.replies.push(newReply);
        }
        this.replyContent = '';
        this.replyingTo = null;
        this.thread.comments_count++;
        this.error = null;
      },
      error: (error) => {
        console.error('Error adding reply:', error);
        this.error = 'Error al agregar la respuesta. Por favor, intenta nuevamente.';
      }
    });
  }

  private findCommentById(commentId: string): ThreadComment | null {
    for (const comment of this.comments) {
      if (comment.id === commentId) {
        return comment;
      }
      if (comment.replies) {
        for (const reply of comment.replies) {
          if (reply.id === commentId) {
            return reply;
          }
        }
      }
    }
    return null;
  }

  likeThread(thread: Thread) {
    this.discussionService.likeThread(thread.id).subscribe({
      next: (response: any) => {
        thread.likes_count = response.new_count;
        thread.user_has_liked = response.action === 'liked';
      },
      error: (error) => {
        console.error('Error liking thread:', error);
        this.error = 'Error al dar like. Por favor, intenta nuevamente.';
      }
    });
  }

  likeComment(comment: ThreadComment) {
    this.discussionService.likeComment(comment.id).subscribe({
      next: (response: any) => {
        comment.likes_count = response.new_count;
        comment.user_has_liked = response.action === 'liked';
      },
      error: (error) => {
        console.error('Error liking comment:', error);
        this.error = 'Error al dar like. Por favor, intenta nuevamente.';
      }
    });
  }

  formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Ahora mismo';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
    return `Hace ${Math.floor(diffDays / 30)} mes`;
  }

  cancelReply() {
    this.replyingTo = null;
    this.replyContent = '';
  }
}