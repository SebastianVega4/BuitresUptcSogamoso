import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { BuitresGuard } from './guards/buitres.guard';

export const routes: Routes = [
  { 
    path: '', 
    redirectTo: 'buitres', 
    pathMatch: 'full'
  },
  { 
    path: 'home', 
    redirectTo: 'buitres', 
    pathMatch: 'full'
  },
  { 
    path: 'buitres', 
    loadComponent: () => import('./components/buitres/buitres.component').then(m => m.BuitresComponent)
  },
  { 
    path: 'buitres/person/:id', 
    loadComponent: () => import('./components/buitres-detail/buitres-detail.component').then(m => m.BuitresDetailComponent),
    canActivate: [BuitresGuard]
  },
  { 
    path: 'about', 
    loadComponent: () => import('./components/about/about.component').then(m => m.AboutComponent) 
  },
  { 
    path: 'foro', 
    loadComponent: () => import('./components/discussion/discussion.component').then(m => m.DiscussionComponent),
    canActivate: [BuitresGuard]
  },
  { 
    path: 'discussion/thread/:id', 
    loadComponent: () => import('./components/thread-detail/thread-detail.component').then(m => m.ThreadDetailComponent) 
  },
  { 
    path: 'admin-login', 
    loadComponent: () => import('./components/admin-login/admin-login').then(m => m.AdminLoginComponent) 
  },
  { 
    path: 'admin-panel', 
    loadComponent: () => import('./components/admin-panel/admin-panel').then(m => m.AdminPanelComponent),
    canActivate: [AuthGuard] 
  },
  { path: '**', redirectTo: 'buitres' }
];
