import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface ModalConfig {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'success' | 'warning' | 'danger' | 'confirm';
  showCancel?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private modalState = new BehaviorSubject<ModalConfig | null>(null);
  private modalResult = new Subject<boolean>();

  modalState$ = this.modalState.asObservable();

  constructor() { }

  open(config: ModalConfig): Observable<boolean> {
    this.modalState.next(config);
    this.modalResult = new Subject<boolean>();
    return this.modalResult.asObservable();
  }

  confirm(message: string, title: string = 'Confirmación'): Observable<boolean> {
    return this.open({
      title,
      message,
      type: 'confirm',
      showCancel: true,
      confirmText: 'Confirmar',
      cancelText: 'Cancelar'
    });
  }

  alert(message: string, title: string = 'Alerta', type: 'info' | 'success' | 'warning' | 'danger' = 'info'): Observable<boolean> {
    return this.open({
      title,
      message,
      type,
      showCancel: false,
      confirmText: 'Aceptar'
    });
  }

  close(result: boolean) {
    this.modalResult.next(result);
    this.modalResult.complete();
    this.modalState.next(null);
  }
}
