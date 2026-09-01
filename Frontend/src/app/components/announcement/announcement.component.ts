import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-announcement',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './announcement.component.html',
  styleUrls: ['./announcement.component.scss']
})
export class AnnouncementComponent {
  isHidden = true; // Start hidden by default as per user preference for "desplegables"

  toggleAnnouncement() {
    this.isHidden = !this.isHidden;
  }
}