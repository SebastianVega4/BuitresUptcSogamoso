import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class BuitresGuard implements CanActivate {

  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): boolean {
    if (this.authService.isBuitresLoggedIn()) {
      return true;
    } else {
      // For the buitres section, we want to allow them to see the landing 
      // but maybe prompt for login inside the component instead of a hard redirect
      // However, to be safe, we'll redirect to a login or home if we want strict protection.
      // Based on the plan, we'll use this guard on the routes.
      this.router.navigate(['/buitres'], { queryParams: { loginRequired: 'true' } });
      return false;
    }
  }
}
