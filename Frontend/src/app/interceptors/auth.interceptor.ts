import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, EMPTY } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Si es un error 401 (No autorizado)
      // Si es un error 401 (No autorizado)
      if (error.status === 401) {
        // Ignorar específicamente el error de check-playing-song
        if (error.url?.includes('api/spotify/admin/check-playing-song')) {
          return EMPTY;
        }
        // Silenciosamente ignoramos el error para no llenar la consola
        return EMPTY; 
      }
      return throwError(() => error);
    })
  );
};
