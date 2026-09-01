import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  // Admin State
  private currentAdminSubject = new BehaviorSubject<any>(null);
  public currentAdmin = this.currentAdminSubject.asObservable();

  // Buitres State
  private currentBuitreSubject = new BehaviorSubject<any>(null);
  public currentBuitre = this.currentBuitreSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadInitialState();
  }

  private loadInitialState() {
    // Cargar usuario Admin
    const adminToken = localStorage.getItem('adminToken');
    const adminUser = localStorage.getItem('adminUser');
    if (adminToken && adminUser) {
      try {
        this.currentAdminSubject.next(JSON.parse(adminUser));
      } catch (e) { console.error('Error parsing admin user', e); }
    }

    // Cargar usuario Buitres
    const buitresToken = localStorage.getItem('buitresToken');
    const buitresUser = localStorage.getItem('buitresUser');
    if (buitresToken && buitresUser) {
       try {
        this.currentBuitreSubject.next(JSON.parse(buitresUser));
      } catch (e) { console.error('Error parsing buitres user', e); }
    }
  }

  // --- ADMIN AUTH ---

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/auth/login`, { email, password }).pipe(
      tap((response: any) => {
        if (response.token) {
          localStorage.setItem('adminToken', response.token);
          if (response.user) {
            localStorage.setItem('adminUser', JSON.stringify(response.user));
            this.currentAdminSubject.next(response.user);
          }
          // Legacy support if needed, but we are separating
          // localStorage.setItem('auth_token', response.token); 
        }
      })
    );
  }

  logoutAdmin(): void {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    // localStorage.removeItem('auth_token');
    this.currentAdminSubject.next(null);
  }

  // Used by AuthGuard for Admin Panel
  isLoggedIn(): boolean {
    return !!localStorage.getItem('adminToken');
  }

  isRoleAdmin(): boolean {
    const userData = localStorage.getItem('adminUser');
    if (!userData) return false;
    try {
      const user = JSON.parse(userData);
      return user.role === 'admin';
    } catch (e) {
      return false;
    }
  }

  getAdminToken(): string | null {
    return localStorage.getItem('adminToken');
  }

  // --- BUITRES AUTH (UPTC) ---

  googleLogin(idToken: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/auth/google`, { idToken }).pipe(
      tap((response: any) => {
        if (response.token) {
          // Store in separate keys
          localStorage.setItem('buitresToken', response.token);
          if (response.user) {
             localStorage.setItem('buitresUser', JSON.stringify(response.user));
             this.currentBuitreSubject.next(response.user);
          }
        }
      })
    );
  }

  logoutBuitres(): void {
    localStorage.removeItem('buitresToken');
    localStorage.removeItem('buitresUser');
    this.currentBuitreSubject.next(null);
  }

  isBuitresLoggedIn(): boolean {
     // Admin also has access to buitres
     if (this.isRoleAdmin()) return true;
     return !!localStorage.getItem('buitresToken');
  }

  getBuitresToken(): string | null {
    // If admin is logged in, use admin token
    if (this.isRoleAdmin()) return this.getAdminToken();
    // Otherwise use buitres token
    return localStorage.getItem('buitresToken');
  }

  // --- COMPATIBILITY ---

  logout(): void {
    this.logoutAdmin();
  }

  getToken(): string | null {
    return this.getAdminToken();
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.getToken(); // Obtener el token JWT
    if (token) {
      return new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });
    }
    return new HttpHeaders({
      'Content-Type': 'application/json'
    });
  }
}
