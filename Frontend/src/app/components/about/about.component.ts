import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetaService } from '../../services/meta.service';
import { AnnouncementComponent } from '../announcement/announcement.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, AnnouncementComponent],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent implements OnInit {

  constructor(private metaService: MetaService) { }

  ngOnInit(): void {
    this.metaService.updatePageData(
      'Buitres UPTC',
      'Conoce más sobre el proyecto comunitario de la UPTC Sogamoso.'
    );
  }
}
