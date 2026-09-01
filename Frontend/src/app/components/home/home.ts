import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MetaService } from '../../services/meta.service';
import { DiscussionService, Thread } from '../../services/discussion.service';

@Component({
  standalone: true,
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
  imports: [CommonModule, RouterModule]
})
export class HomeComponent implements OnInit {
  showLoginAlert: boolean = false;
  forumThreads: Thread[] = [];

  constructor(
    private metaService: MetaService,
    private discussionService: DiscussionService,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.metaService.updatePageData('Buitres UPTC', 'La comunidad de la UPTC Sogamoso');
    this.loadForumThreads();

    this.route.queryParams.subscribe(params => {
      if (params['loginRequired'] === 'buitres') {
        this.showLoginAlert = true;
      }
    });
  }

  loadForumThreads(): void {
    this.discussionService.getThreads().subscribe({
      next: (threads) => {
        this.forumThreads = threads.filter(t => t.image_url).slice(0, 10);
      },
      error: (err) => console.error('Error loading forum threads:', err)
    });
  }
}
