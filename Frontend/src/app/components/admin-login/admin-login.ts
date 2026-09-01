import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-login.html',
  styleUrls: ['./admin-login.scss']
})
export class AdminLoginComponent implements OnInit, OnDestroy {
  email = '';
  password = '';
  errorMessage = '';
  isLoading = false;

  particles: any[] = [];

  constructor(public authService: AuthService, private router: Router) { }

  ngOnInit(): void {
    document.body.classList.add('login-page-active');
    this.createParticles();
  }

  ngOnDestroy(): void {
    document.body.classList.remove('login-page-active');
  }

  createParticles() {
    const numberOfParticles = 15;
    for (let i = 0; i < numberOfParticles; i++) {
      this.particles.push(this.generateParticle());
    }
  }

  generateParticle() {
    const size = Math.random() * 20 + 20; // 20px to 70px
    const duration = Math.random() * 90 + 15; // 15s to 25s
    const delay = Math.random() * 7; // 0s to 10s
    const left = Math.random() * 100;

    return {
      width: `${size}px`,
      height: `${size}px`,
      left: `${left}%`,
      animationDuration: `${duration}s`,
      animationDelay: `${delay}s`,
    };
  }

  login() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Por favor, completa ambos campos.';
      return;
    }
  
    this.isLoading = true;
    this.errorMessage = '';
  
    this.authService.login(this.email, this.password)
      .subscribe({
        next: () => {
          this.isLoading = false;
          setTimeout(() => {
            this.router.navigate(['/admin-panel']);
          }, 1500);
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = this.getFirebaseErrorMessage(error);
        }
      });
  }

  private getFirebaseErrorMessage(error: any): string {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'El formato del correo electrónico no es válido.';
      case 'auth/user-disabled':
        return 'Este usuario ha sido deshabilitado.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Correo electrónico o contraseña incorrectos.';
      case 'auth/too-many-requests':
        return 'Acceso bloqueado por demasiados intentos. Intenta de nuevo más tarde.';
      default:
        console.error('Error de login no manejado:', error); // Log para depuración
        return 'Error al iniciar sesión. Verifica tus credenciales e intenta de nuevo.';
    }
  }
}
