import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BuitresService, BuitrePerson, BuitreDetail, BuitreComment, BuitreSongNote } from '../../services/buitres.service';
import { AuthService } from '../../services/auth';
import { ModalService } from '../../services/modal.service';

import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-buitres-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './buitres-detail.component.html',
  styleUrls: ['./buitres-detail.component.scss']
})
export class BuitresDetailComponent implements OnInit, OnDestroy {
  person: BuitrePerson | null = null;
  details: BuitreDetail[] = [];
  comments: BuitreComment[] = [];
  songNotes: BuitreSongNote[] = [];
  
  newComment: string = '';
  newDetailContent: string = '';
  voting: boolean = false;
  fingerprint: string = '';
  isAdmin: boolean = false;
  isOwner: boolean = false;

  // Song Notes State
  showSongModal: boolean = false;
  activeNoteTab: 'song' | 'text' = 'song';
  songSearchQuery: string = '';
  songSearchResults: any[] = [];
  isSearchingSongs: boolean = false;
  selectedSong: any = null;
  newSongDedication: string = '';
  newTextNoteContent: string = '';
  private searchSubject = new Subject<string>();
  
  // Real-time flash states for visual feedback
  flashLikes: boolean = false;
  flashDislikes: boolean = false;
  flashTags: boolean = false;
  flashComments: boolean = false;
  flashCommentLikes: { [key: string]: boolean } = {};
  
  // Admin Edit State
  isEditing: boolean = false;
  editName: string = '';
  editEmail: string = '';
  editGender: 'male' | 'female' | '' = '';
  editImageUrl: string = '';
  
  // Dedication Modal State
  showFullDedicationModal: boolean = false;
  selectedDedicationText: string = '';
  
  sortOption: 'newest' | 'oldest' | 'likes' = 'newest';

  private subscriptions: any[] = [];

  private audio: HTMLAudioElement | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private buitresService: BuitresService,
    private authService: AuthService,
    private modalService: ModalService
  ) {
    // Setup debounced search
    this.subscriptions.push(
      this.searchSubject.pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(query => {
          this.isSearchingSongs = true;
          if (!query.trim()) {
            this.isSearchingSongs = false;
            return [];
          }
          return this.buitresService.searchSongs(query);
        })
      ).subscribe({
        next: (results) => {
          this.songSearchResults = results;
          this.isSearchingSongs = false;
        },
        error: () => {
          this.isSearchingSongs = false;
          this.songSearchResults = [];
        }
      })
    );
  }

  ngOnInit() {
    this.isAdmin = this.authService.isRoleAdmin();
    this.fingerprint = this.getFingerprint();
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.loadData(id);
        this.setupRealtime(id);
      }
    });
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }
  
  // --- Song Notes Methods ---

  loadSongNotes(id: string) {
    this.buitresService.getSongNotes(id).subscribe(notes => {
      this.songNotes = notes;
    });
  }

  openSongModal() {
    if (!this.authService.isBuitresLoggedIn()) {
      this.modalService.alert('Debes iniciar sesión para dejar notas.', 'Acceso Restringido', 'warning');
      return;
    }
    
    if (this.isOwner) {
      this.modalService.alert('No puedes dejarte notas a ti mismo.', 'Acción no permitida', 'warning');
      return;
    }

    this.showSongModal = true;
    this.activeNoteTab = 'song';
    this.songSearchQuery = '';
    this.songSearchResults = [];
    this.selectedSong = null;
    this.newSongDedication = '';
    this.newTextNoteContent = '';
  }

  closeSongModal() {
    this.showSongModal = false;
  }
  
  switchNoteTab(tab: 'song' | 'text') {
      this.activeNoteTab = tab;
  }

  onSongSearchInput(query: string) {
    this.searchSubject.next(query);
  }

  selectSong(song: any) {
    this.selectedSong = song;
  }

  postNote() {
    if (!this.person) return;
    
    if (this.activeNoteTab === 'song') {
        if (!this.selectedSong) return;
        
        console.log('Posting song note with data:', this.selectedSong);
        
        this.buitresService.addSongNote(this.person.id, this.selectedSong, this.newSongDedication, 'song').subscribe({
          next: (note) => {
            console.log('Song note posted successfully:', note);
            this.songNotes.unshift(note);
            this.closeSongModal();
            this.modalService.alert('Canción dedicada correctamente.', '¡Éxito!', 'success');
          },
          error: (err) => {
            console.error('Error posting song note:', err);
            this.modalService.alert('No se pudo dedicar la canción.', 'Error', 'danger');
          }
        });
    } else {
        // Text Note
        if (!this.newTextNoteContent.trim()) return;
        
        this.buitresService.addSongNote(this.person.id, null, this.newTextNoteContent, 'text').subscribe({
          next: (note) => {
            this.songNotes.unshift(note);
            this.closeSongModal();
            this.modalService.alert('Nota publicada correctamente.', '¡Éxito!', 'success');
          },
          error: (err) => {
            console.error('Error posting text note:', err);
            this.modalService.alert('No se pudo publicar la nota.', 'Error', 'danger');
          }
        });
    }
  }
  
  deleteNote(noteId: string) {
    this.modalService.confirm('¿Estás seguro de eliminar esta nota?', 'Eliminar Nota').subscribe(confirmed => {
      if (confirmed) {
        this.buitresService.deleteSongNote(noteId).subscribe({
          next: () => {
            this.songNotes = this.songNotes.filter(n => n.id !== noteId);
            this.modalService.alert('Nota eliminada.', '¡Éxito!', 'success');
          },
          error: (err) => {
            this.modalService.alert('No tienes permiso para eliminar esta nota.', 'Error', 'danger');
          }
        });
      }
    });
  }

  playPreview(url: string | null | undefined, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (url) {
      if (this.audio) {
        this.audio.pause();
      }
      this.audio = new Audio(url);
      this.audio.play().catch(() => {
        this.modalService.alert('No se pudo reproducir la vista previa.', 'Aviso', 'info');
      });
    } else {
      this.modalService.alert('Esta canción no tiene vista previa disponible.', 'Aviso', 'info');
    }
  }

  openDedicationModal(text: string, event: Event) {
    event.stopPropagation();
    this.selectedDedicationText = text;
    this.showFullDedicationModal = true;
  }

  private getFingerprint(): string {
    let fp = localStorage.getItem('user_fingerprint');
    if (!fp) {
      fp = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('user_fingerprint', fp);
    }
    return fp;
  }

  setupRealtime(id: string) {
    // Escuchar cambios en la persona (votos)
    this.subscriptions.push(
      this.buitresService.subscribeToChanges('buitres_people', (payload) => {
        if (payload.new && payload.new.id === id) {
          const oldLikes = this.person?.likes_count || 0;
          const oldDislikes = this.person?.dislikes_count || 0;
          
          this.person = { ...this.person, ...payload.new };
          
          if (payload.new.likes_count !== oldLikes) this.triggerFlash('likes');
          if (payload.new.dislikes_count !== oldDislikes) this.triggerFlash('dislikes');
        }
      })
    );

    // Escuchar cambios en detalles (etiquetas)
    this.subscriptions.push(
      this.buitresService.subscribeToChanges('buitres_details', (payload) => {
        if (payload.new && payload.new.person_id === id) {
          this.loadDetails(id);
          this.triggerFlash('tags');
        } else if (payload.old && payload.old.person_id === id) {
          this.loadDetails(id);
        }
      })
    );

    // Escuchar nuevos comentarios
    this.subscriptions.push(
      this.buitresService.subscribeToChanges('buitres_comments', (payload) => {
        if (payload.new && payload.new.person_id === id) {
          this.loadComments(id);
          this.triggerFlash('comments');
        } else if (payload.old && payload.old.person_id === id) {
          this.loadComments(id);
        }
      })
    );
  }

  private triggerFlash(type: 'likes' | 'dislikes' | 'tags' | 'comments') {
    if (type === 'likes') this.flashLikes = true;
    if (type === 'dislikes') this.flashDislikes = true;
    if (type === 'tags') this.flashTags = true;
    if (type === 'comments') this.flashComments = true;

    setTimeout(() => {
      if (type === 'likes') this.flashLikes = false;
      if (type === 'dislikes') this.flashDislikes = false;
      if (type === 'tags') this.flashTags = false;
      if (type === 'comments') this.flashComments = false;
    }, 2000);
  }

  loadData(id: string) {
    this.buitresService.getPersonById(id).subscribe(p => {
        this.person = p;
        this.checkOwnership();
    });
    this.loadDetails(id);
    this.loadComments(id);
    this.loadSongNotes(id);
  }

  checkOwnership() {
    if (!this.person) return;
    
    // Si ya es admin, no importa
    if (this.isAdmin) return;

    const sub = this.authService.currentBuitre.subscribe(user => {
        if (user && user.email && this.person?.email) {
            this.isOwner = user.email.trim().toLowerCase() === this.person.email.trim().toLowerCase();
        } else {
            this.isOwner = false;
        }
    });
    this.subscriptions.push(sub);
  }

  loadDetails(id: string) {
    this.buitresService.getDetails(id).subscribe(d => this.details = d);
  }

  loadComments(id: string) {
    this.buitresService.getComments(id).subscribe(c => {
      this.comments = c;
      this.sortComments();
    });
  }
  
  sortComments() {
    if (this.sortOption === 'newest') {
      this.comments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (this.sortOption === 'oldest') {
      this.comments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (this.sortOption === 'likes') {
      this.comments.sort((a, b) => b.likes_count - a.likes_count);
    }
  }

  vote(type: 'like' | 'dislike') {
    if (!this.person || this.voting) return;
    this.voting = true;
    this.buitresService.votePerson(this.person.id, type, this.fingerprint).subscribe({
      next: () => {
        this.loadData(this.person!.id);
        this.voting = false;
      },
      error: (err) => {
        const errorMsg = err.error?.error || 'Ya has votado por esta persona.';
        this.modalService.alert(errorMsg, 'Atención', 'warning');
        this.voting = false;
      }
    });
  }

  submitComment() {
    if (!this.person || !this.newComment) return;

    if (this.isOwner) {
      this.modalService.alert('No puedes publicar comentarios en tu propio perfil.', 'Acción no permitida', 'warning');
      return;
    }

    // Seguridad: Bloquear si tiene 10 o más números (evitar spam de teléfonos)
    const digitCount = (this.newComment.match(/\d/g) || []).length;
    if (digitCount >= 10) {
      this.modalService.alert('Por seguridad, no se permiten comentarios con números de teléfono.', 'Aviso de Seguridad', 'warning');
      return;
    }

    this.buitresService.addComment(this.person.id, this.newComment, this.fingerprint).subscribe({
      next: (newComment: any) => {
        this.modalService.alert('Comentario publicado correctamente.', '¡Éxito!', 'success');
        this.newComment = '';
        
        // Update local state immediately
        if (newComment && newComment.id) {
            this.comments.push(newComment);
            this.sortComments();
        } else {
            this.loadComments(this.person!.id);
        }
      },
      error: (err) => {
        const errorMsg = err.error?.error || 'No se pudo publicar el comentario. Intenta de nuevo.';
        this.modalService.alert(errorMsg, 'Error', 'danger');
        console.error('Comment error:', err);
      }
    });
  }

  addDetail() {
    if (!this.person || !this.newDetailContent) return;

    // Seguridad: Bloquear si tiene 10 o más números
    const digitCount = (this.newDetailContent.match(/\d/g) || []).length;
    if (digitCount >= 10) {
      this.modalService.alert('Por seguridad, no se permiten etiquetas con números de teléfono.', 'Aviso de Seguridad', 'warning');
      return;
    }

    // Normalizar a Title Case
    const normalizedTag = this.newDetailContent
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    this.incrementDetail(normalizedTag);
    this.newDetailContent = '';
  }

  incrementDetail(content: string) {
    if (!this.person) return;
    this.buitresService.addOrIncrementDetail(this.person.id, content, this.fingerprint).subscribe({
      next: (response: any) => {
        const action = response.action || 'added';
        const newCount = response.new_count || 0;
        
        let message = '';
        if (action === 'added') {
          message = `Apoyo agregado a "${content} " ${newCount}`;
        } else if (action === 'removed') {
          if (response.deleted) {
            message = `Etiqueta "${content}" eliminada (llegó a 0 apoyos)`;
          } else {
            message = `Apoyo removido de "${content}" (${newCount})`;
          }
        }
        
        this.modalService.alert(message, '¡Éxito!', 'success');
        
        // Update local state immediately
        if (response.data) {
             const index = this.details.findIndex(d => d.content.toLowerCase() === content.toLowerCase());
             if (response.action === 'removed' && response.deleted) {
                 if (index !== -1) this.details.splice(index, 1);
             } else if (index !== -1) {
                 // Update existing
                 this.details[index] = { ...this.details[index], ...response.data };
             } else {
                 // Add new
                 this.details.push(response.data);
             }
             // Re-sort details by occurrence_count
             this.details.sort((a, b) => b.occurrence_count - a.occurrence_count);
        } else {
            this.loadDetails(this.person!.id);
        }
      },
      error: (err) => {
        const errorMsg = err.error?.error || 'No se pudo procesar la acción.';
        this.modalService.alert(errorMsg, 'Error', 'danger');
        console.error('Error con tag:', err);
      }
    });
  }

  getEmail(p: BuitrePerson | null): string {
      return p?.email || '';
  }
  
  // --- Admin Methods ---

  startEditing() {
    if (!this.person) return;
    this.editName = this.person.name;
    this.editEmail = this.person.email || '';
    this.editGender = this.person.gender as any;
    this.editImageUrl = this.person.image_url || '';
    this.isEditing = true;
  }
  
  editImage() {
    if (!this.person || (!this.isOwner && !this.isAdmin)) return;
    this.startEditing();
  }

  selectedFile: File | null = null;
  isUploading: boolean = false;

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  saveEdits() {
    if (!this.person || !this.editGender) return;

    if (this.selectedFile) {
        this.isUploading = true;
        this.buitresService.uploadImage(this.selectedFile).subscribe({
            next: (response) => {
                this.editImageUrl = response.url;
                this.selectedFile = null; // Clear file after upload
                this.savePersonData();
            },
            error: (err) => {
                console.error('Error uploading image:', err);
                this.modalService.alert('Error al subir la imagen.', 'Error', 'danger');
                this.isUploading = false;
            }
        });
    } else {
        this.savePersonData();
    }
  }

  savePersonData() {
    if (!this.person) return;

    const updates: any = {};

    if (this.isAdmin) {
        if (!this.editName) return;
        
        // Normalizar a Title Case
        const normalizedName = this.editName
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
        
        updates.name = normalizedName;
        updates.email = this.editEmail;
    }

    // Tanto admin como owner pueden editar género y foto
    updates.gender = this.editGender;
    updates.image_url = this.editImageUrl;

    this.buitresService.updatePerson(this.person.id, updates).subscribe({
      next: () => {
        this.isEditing = false;
        this.isUploading = false;
        this.loadData(this.person!.id);
      },
      error: (err) => {
        console.error('Update error:', err);
        this.modalService.alert('Error al actualizar perfil.', 'Error', 'danger');
        this.isUploading = false;
      }
    });
  }

  deleteComment(id: string) {
    this.modalService.confirm('¿Estás seguro de eliminar este comentario?', 'Eliminar Comentario').subscribe(confirmed => {
      if (confirmed) {
        this.buitresService.deleteComment(id).subscribe(() => {
          this.modalService.alert('Comentario eliminado.', '¡Éxito!', 'success');
          if (this.person) this.loadComments(this.person.id);
        });
      }
    });
  }

  likeComment(commentId: string) {
    if (!this.person) return;
    this.buitresService.likeComment(commentId, this.fingerprint).subscribe({
      next: (response: any) => {
        // Feedback visual
        this.flashCommentLikes[commentId] = true;
        setTimeout(() => this.flashCommentLikes[commentId] = false, 1000);

        // Actualizar localmente inmediatamente para feedback visual
        const comment = this.comments.find(c => c.id === commentId);
        if (comment && typeof response.new_likes === 'number') {
          comment.likes_count = response.new_likes;
        } else {
          // Fallback por si acaso
          this.loadComments(this.person!.id);
        }
      },
      error: (err) => {
        const errorMsg = err.error?.error || 'No se pudo procesar el like.';
        this.modalService.alert(errorMsg, 'Error', 'danger');
        console.error('Error con like:', err);
      }
    });
  }

  deleteDetail(id: string) {
    this.modalService.confirm('¿Estás seguro de eliminar esta etiqueta?', 'Eliminar Etiqueta').subscribe(confirmed => {
      if (confirmed) {
        this.buitresService.deleteDetail(id).subscribe(() => {
          this.modalService.alert('Etiqueta eliminada.', '¡Éxito!', 'success');
          if (this.person) this.loadDetails(this.person.id);
        });
      }
    });
  }

  deletePerson() {
    if (!this.person) return;
    this.modalService.confirm(
      `¿Estás seguro de eliminar permanentemente el perfil de "${this.person.name}"? Esta acción no se puede deshacer.`,
      'Eliminar Perfil'
    ).subscribe(confirmed => {
      if (confirmed && this.person) {
        this.buitresService.deletePerson(this.person.id).subscribe({
          next: () => {
            this.modalService.alert('Perfil eliminado.', '¡Éxito!', 'success');
            this.router.navigate(['/buitres']);
          },
          error: (err) => this.modalService.alert('Error al eliminar perfil.', 'Error', 'danger')
        });
      }
    });
  }

  requestRemoval() {
    if (!this.person) return;
    const email = 'johan.vega01@uptc.edu.co';
    const subject = encodeURIComponent(`Solicitud de eliminación de perfil: ${this.person.name}`);
    const body = encodeURIComponent(`Hola johan,\n\nDeseo solicitar la eliminación del perfil "${this.person.name}" (ID: ${this.person.id}) del directorio comunitario de Buitres UPTC.\n\nAtentamente,\nUn integrante de la comunidad.`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }
}
