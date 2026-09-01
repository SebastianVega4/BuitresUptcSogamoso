import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BuitresService, BuitrePerson } from '../../services/buitres.service';
import { AuthService } from '../../services/auth';
import { ModalService } from '../../services/modal.service';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

declare var google: any;

import { DiscussionComponent } from '../discussion/discussion.component';

@Component({
  selector: 'app-buitres',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DiscussionComponent],
  templateUrl: './buitres.component.html',
  styleUrls: ['./buitres.component.scss']
})
export class BuitresComponent implements OnInit, AfterViewInit, OnDestroy {
  activeTab: 'people' | 'discussion' = 'discussion'; // Control de pestañas
  people: BuitrePerson[] = [];
  suggestions: BuitrePerson[] = [];
  searchQuery: string = '';
  loading: boolean = false;
  showCreateForm: boolean = false;
  totalPeople: number = 0;
  currentSort: 'recent' | 'likes' | 'comments' | 'tags' | 'notes' = 'recent';
  
  // Real-time flash states
  flashStates: { [key: string]: boolean } = {};
  private subscriptions: any[] = [];
  
  // Admin Features
  isAdmin: boolean = false;
  isMerging: boolean = false;
  mergeSelected: BuitrePerson | null = null;
  mergeQuery: string = '';

  newName: string = '';
  newEmail: string = '';
  newGender: 'male' | 'female' | '' = '';
  newDescription: string = '';

  private searchSubject = new Subject<string>();

  isLoggedIn: boolean = false;
  loginError: string = '';
  dataAccepted: boolean = false;

  constructor(
    private buitresService: BuitresService,
    private authService: AuthService,
    public router: Router,
    private modalService: ModalService
  ) {}

  ngOnInit() {
    this.isLoggedIn = this.authService.isBuitresLoggedIn();
    this.isAdmin = this.authService.isRoleAdmin(); 
    if (this.isLoggedIn) {
      this.loadPeople();
      this.loadTotalCount();
      this.setupRealtime();
    }

    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      if (query.length >= 2) {
        this.buitresService.getPeople(query, this.currentSort).subscribe(res => {
          this.suggestions = res;
        });
      } else {
        this.suggestions = [];
        if (query.length === 0) this.loadPeople();
      }
    });
  }

  ngAfterViewInit() {
    if (!this.isLoggedIn) {
      this.initGoogleAuth();
    }
  }

  initGoogleAuth() {
    // Intentar inicializar Google Button cada 1s hasta que la librería cargue
    const interval = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts) {
        this.renderGoogleButton();
        clearInterval(interval);
      }
    }, 1000);
  }

  renderGoogleButton() {
    google.accounts.id.initialize({
      client_id: '361673258362-sf6ils8hu37d9b5ptmvds329aspgtiao.apps.googleusercontent.com',
      callback: (response: any) => this.handleGoogleLogin(response)
    });

    google.accounts.id.renderButton(
      document.getElementById('google-btn-container'),
      { theme: 'outline', size: 'large', width: '100%' }
    );
  }

  handleGoogleLogin(response: any) {
    const idToken = response.credential;
    this.loading = true;
    this.authService.googleLogin(idToken).subscribe({
      next: () => {
        this.isLoggedIn = true;
        this.isAdmin = this.authService.isRoleAdmin();
        this.loadPeople();
        this.loadTotalCount();
        this.loading = false;
      },
      error: (err) => {
        this.loginError = err.error?.error || 'Error al iniciar sesión';
        this.loading = false;
        this.modalService.alert(this.loginError, 'Error de Acceso', 'danger');
      }
    });
  }

  logout() {
    if (this.authService.isRoleAdmin()) {
      this.authService.logoutAdmin();
    } else {
      this.authService.logoutBuitres();
    }
    this.isLoggedIn = false;
    this.isAdmin = false;
    this.dataAccepted = false;
    this.people = [];
    // Reinicializar botón si decide volver a loguear
    setTimeout(() => this.initGoogleAuth(), 100);
  }

  loadTotalCount() {
    this.buitresService.getTotalPeopleCount().subscribe(count => {
      this.totalPeople = count;
    });
  }

  setSort(sort: 'recent' | 'likes' | 'comments' | 'tags' | 'notes') {
    this.currentSort = sort;
    this.loadPeople();
  }

  selectSuggestion(person: BuitrePerson) {
    this.router.navigate(['/buitres/person', person.id]);
    this.suggestions = [];
    this.searchQuery = '';
  }

  search() {
    if (this.searchQuery.trim().length === 0) {
      this.loadPeople();
      return;
    }
    
    this.loading = true;
    this.suggestions = []; // Hide suggestions when searching
    this.buitresService.getPeople(this.searchQuery, this.currentSort).subscribe({
      next: (results) => {
        this.people = results;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  loadPeople(search: string = '') {
    this.loading = true;
    this.buitresService.getPeople(search, this.currentSort).subscribe(results => {
      this.people = results;
      this.loading = false;
    });
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  setupRealtime() {
    // Escuchar cambios en la lista de personas
    this.subscriptions.push(
      this.buitresService.subscribeToChanges('buitres_people', (payload: any) => {
        if (payload.eventType === 'UPDATE') {
          const index = this.people.findIndex(p => p.id === payload.new.id);
          if (index !== -1) {
            this.people[index] = { ...this.people[index], ...payload.new };
            this.triggerFlash(payload.new.id);
          }
        } else if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
          this.loadPeople();
          this.loadTotalCount();
        }
      })
    );
  }

  private triggerFlash(id: string) {
    this.flashStates[id] = true;
    setTimeout(() => {
      this.flashStates[id] = false;
    }, 1500);
  }

  onSearchChange(query: string) {
    this.searchSubject.next(query);
  }

  openCreateFormWithSearch() {
    this.newName = this.searchQuery;
    this.showCreateForm = true;
    this.suggestions = [];
    this.searchQuery = ''; // Clear search to hide suggestions
  }

  createPerson(event: Event) {
    event.preventDefault();
    if (!this.newName || !this.newGender) return;

    // Validación: Al menos un espacio para Nombre + Apellido
    if (!this.newName.trim().includes(' ')) {
      this.modalService.alert('Por favor, ingresa nombre y al menos un apellido (mínimo un espacio).', 'Nombre Incompleto', 'warning');
      return;
    }

    // Normalizar a Title Case
    const normalizedName = this.newName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    this.buitresService.createPerson(normalizedName, this.newEmail ? `Email: ${this.newEmail}` : this.newDescription, this.newGender, this.newEmail).subscribe({
      next: (res) => {
        this.modalService.alert(`Perfil de "${normalizedName}" creado correctamente.`, '¡Éxito!', 'success');
        this.showCreateForm = false;
        this.newName = '';
        this.newEmail = '';
        this.newGender = '';
        this.newDescription = '';
        this.loadPeople();
        this.loadTotalCount();
      },
      error: (err: any) => {
        // Fallback if email column doesn't exist
        if (err.message && err.message.includes('email" does not exist')) {
            this.buitresService.createPerson(normalizedName, this.newEmail ? `Email: ${this.newEmail}` : this.newDescription, this.newGender).subscribe(() => {
                this.showCreateForm = false;
                this.newName = '';
                this.newEmail = '';
                this.newGender = '';
                this.newDescription = '';
                this.loadPeople();
                this.loadTotalCount();
            });
        } else if (err.code === '23505') {
          this.modalService.alert('Esta persona ya existe en la base de datos.', 'Error', 'warning');
        } else {
          this.modalService.alert('Error al crear persona.', 'Error', 'danger');
        }
      }
    });
  }

  get filteredPeople() {
    if (!this.isMerging) return this.people;
    if (!this.mergeQuery) return this.people;
    
    const queryWords = this.mergeQuery.toLowerCase().split(' ').filter(w => w.length > 0);
    
    return this.people.filter(p => {
      const nameLower = p.name.toLowerCase();
      const matchesAll = queryWords.every(word => nameLower.includes(word));
      return matchesAll && p.id !== this.mergeSelected?.id;
    });
  }

  // --- Admin Merging Logic ---

  startMerge(person: BuitrePerson) {
    this.mergeSelected = person;
    this.isMerging = true;
  }

  selectForMerge(target: BuitrePerson) {
    if (!this.mergeSelected || this.mergeSelected.id === target.id) return;

    this.modalService.confirm(
      `¿Estás seguro de fusionar a "${target.name}" dentro de "${this.mergeSelected.name}"? Los votos y comentarios se mantendrán, pero el perfil de "${target.name}" desaparecerá.`,
      'Confirmar Fusión'
    ).subscribe(confirmed => {
      if (confirmed && this.mergeSelected) {
        this.buitresService.mergePersons(this.mergeSelected.id, target.id).subscribe({
          next: () => {
            this.modalService.alert('Perfiles fusionados correctamente.', '¡Éxito!', 'success');
            this.resetMerge();
            this.loadPeople();
          },
          error: (err) => {
            console.error('Error merging:', err);
            this.modalService.alert('Error al fusionar perfiles.', 'Error', 'danger');
          }
        });
      }
    });
  }

  resetMerge() {
    this.isMerging = false;
    this.mergeSelected = null;
  }


  deletePerson(person: BuitrePerson) {
    this.modalService.confirm(
      `¿Estás seguro de eliminar el perfil de "${person.name}" permanentemente? Se borrarán todos sus votos y comentarios.`,
      'Eliminar Perfil'
    ).subscribe(confirmed => {
      if (confirmed) {
        this.buitresService.deletePerson(person.id).subscribe({
          next: () => {
            this.modalService.alert('Perfil eliminado.', '¡Éxito!', 'success');
            this.loadPeople();
            this.loadTotalCount();
          },
          error: (err) => this.modalService.alert('Error al eliminar perfil.', 'Error', 'danger')
        });
      }
    });
  }

  formatTimeAgo(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'hace un momento';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `hace ${days} d`;
    
    return date.toLocaleDateString();
  }
}
