import { Injectable } from '@angular/core';
import { Meta, Title, MetaDefinition } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class MetaService {

  constructor(private title: Title, private meta: Meta) { }

  updateTitle(title: string) {
    this.title.setTitle(`${title} | MusicaUPTC`);
  }

  updateTags(tags: MetaDefinition[]) {
    tags.forEach(tag => {
      this.meta.updateTag(tag);
    });
  }

  updatePageData(title: string, description: string, image?: string) {
    this.updateTitle(title);
    
    const tags: MetaDefinition[] = [
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'twitter:card', content: 'summary_large_image' },
      { property: 'twitter:title', content: title },
      { property: 'twitter:description', content: description },
    ];

    if (image) {
      tags.push({ property: 'og:image', content: image });
      tags.push({ property: 'twitter:image', content: image });
    }

    this.updateTags(tags);
  }
}
