import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService, ModalConfig } from '../../services/modal.service';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('scaleIn', [
      transition(':enter', [
        style({ transform: 'scale(0.9)', opacity: 0 }),
        animate('200ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({ transform: 'scale(1)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ transform: 'scale(0.9)', opacity: 0 }))
      ])
    ])
  ]
})
export class ModalComponent implements OnInit {
  config: ModalConfig | null = null;

  constructor(private modalService: ModalService) { }

  ngOnInit(): void {
    this.modalService.modalState$.subscribe(config => {
      this.config = config;
    });
  }

  confirm() {
    this.modalService.close(true);
  }

  cancel() {
    this.modalService.close(false);
  }

  closeBackdrop(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      if (this.config?.showCancel) {
        this.cancel();
      } else {
        this.confirm(); // If it's just an alert, clicking outside is like OK
      }
    }
  }
}
