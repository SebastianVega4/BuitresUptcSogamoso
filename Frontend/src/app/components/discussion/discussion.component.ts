import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DiscussionService, Thread } from '../../services/discussion.service';
import { AuthService } from '../../services/auth';

@Component({
  standalone: true,
  selector: 'app-discussion',
  templateUrl: './discussion.component.html',
  styleUrls: ['./discussion.component.scss'],
  imports: [CommonModule, FormsModule, RouterModule]
})
export class DiscussionComponent implements OnInit {
  threads: Thread[] = [];
  showCreateForm = false;
  newThread = { title: '', content: '' };
  isLoading = false;
  sortBy = 'updated_at';
  error: string | null = null;
  isAdmin: boolean = false; // Added
  authorFingerprint: string = ''; // Added

  constructor(
    private discussionService: DiscussionService,
    private authService: AuthService // Added
  ) {}

  ngOnInit() {
    this.authorFingerprint = localStorage.getItem('userFingerprint') || 'unknown'; // Added
    this.checkAdminStatus(); // Added
    this.loadThreads();
  }

  checkAdminStatus() { // Added
    this.isAdmin = this.authService.isRoleAdmin();
  }

  loadThreads() {
    this.isLoading = true;
    this.error = null;
    
    this.discussionService.getThreads(this.sortBy).subscribe({
      next: (threads) => {
        this.threads = threads.map(thread => ({
          ...thread,
          user_has_liked: this.discussionService.hasUserLiked('thread', thread.id)
        }));
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading threads:', error);
        this.error = 'Error al cargar los hilos. Por favor, intenta nuevamente.';
        this.isLoading = false;
      }
    });
  }

  selectedFile: File | null = null;

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  createThread() {
    // Solo requerimos contenido. El backend maneja el título si está vacío.
    if (!this.newThread.content.trim()) return;

    if (this.selectedFile) {
      this.isLoading = true; // Show loading while uploading
      this.discussionService.uploadImage(this.selectedFile).subscribe({
        next: (response) => {
          this.createThreadWithImage(response.url);
        },
        error: (error) => {
          console.error('Error uploading image:', error);
          this.error = 'Error al subir la imagen. Intenta nuevamente.';
          this.isLoading = false;
        }
      });
    } else {
      this.createThreadWithImage();
    }
  }

  createThreadWithImage(imageUrl?: string) {
    this.discussionService.createThread(this.newThread.title, this.newThread.content, imageUrl).subscribe({
      next: (thread) => {
        this.threads.unshift({
          ...thread,
          user_has_liked: false
        });
        this.showCreateForm = false;
        this.newThread = { title: '', content: '' };
        this.selectedFile = null; // Reset file
        this.error = null;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error creating thread:', error);
        this.error = 'Error al crear el hilo. Por favor, intenta nuevamente.';
        this.isLoading = false;
      }
    });
  }

  deleteThread(thread: Thread, event: Event) {
    event.stopPropagation();
    if (!confirm('¿Estás seguro de que quieres eliminar este hilo? Esta acción no se puede deshacer.')) return;

    this.discussionService.deleteThread(thread.id).subscribe({
      next: () => {
        this.threads = this.threads.filter(t => t.id !== thread.id);
      },
      error: (error) => {
        console.error('Error deleting thread:', error);
        alert('Error al eliminar el hilo');
      }
    });
  }

  likeThread(thread: Thread) {
    this.discussionService.likeThread(thread.id).subscribe({
      next: (response) => {
        thread.likes_count = response.new_count;
        thread.user_has_liked = response.action === 'liked';
      },
      error: (error) => {
        console.error('Error liking thread:', error);
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
}