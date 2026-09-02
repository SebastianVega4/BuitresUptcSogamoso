import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth';
import { BuitresService } from '../../services/buitres.service';

@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.html',
  styleUrls: ['./admin-panel.scss'],
  standalone: true,
  imports: [CommonModule, RouterLink]
})
export class AdminPanelComponent implements OnInit {
  activeSection = 'dashboard';
  buitres: any[] = [];
  totalBuitres = 0;
  isLoading = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private buitresService: BuitresService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadBuitresCount();
    this.loadAllBuitres();
  }

  loadBuitresCount() {
    this.buitresService.getTotalPeopleCount().subscribe({
      next: (count) => this.totalBuitres = count,
      error: (err) => console.error('Error loading buitres count:', err)
    });
  }

  loadAllBuitres() {
    this.isLoading = true;
    this.buitresService.getPeople('', 'recent').subscribe({
      next: (buitres) => {
        this.buitres = buitres;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading buitres:', err);
        this.isLoading = false;
      }
    });
  }

  deleteBuitre(id: string, name: string) {
    if (confirm(`¿Estás seguro de eliminar a "${name}"?`)) {
      this.buitresService.deletePerson(id).subscribe({
        next: () => {
          this.loadAllBuitres();
          this.loadBuitresCount();
          this.showMessage('Buitre eliminado correctamente');
        },
        error: (err) => {
          console.error('Error deleting buitre:', err);
          this.showMessage('Error al eliminar buitre', true);
        }
      });
    }
  }

  mergeBuitres(keepId: string, removeId: string) {
    if (confirm('¿Fusionar estos dos buitres?')) {
      this.buitresService.mergePersons(keepId, removeId).subscribe({
        next: () => {
          this.loadAllBuitres();
          this.loadBuitresCount();
          this.showMessage('Buitres fusionados correctamente');
        },
        error: (err) => {
          console.error('Error merging buitres:', err);
          this.showMessage('Error al fusionar buitres', true);
        }
      });
    }
  }

  setActiveSection(section: string) {
    this.activeSection = section;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/admin-login']);
  }

  showMessage(message: string, isError = false) {
    if (isError) {
      this.errorMessage = message;
      setTimeout(() => this.errorMessage = '', 3000);
    } else {
      this.successMessage = message;
      setTimeout(() => this.successMessage = '', 3000);
    }
  }
}
