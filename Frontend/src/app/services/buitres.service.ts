import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';

export interface BuitrePerson {
  id: string;
  name: string;
  email?: string;
  description?: string;
  image_url?: string;
  gender: 'male' | 'female';
  likes_count: number;
  dislikes_count: number;
  deletions_count?: number; // Added field
  is_merged: boolean;
  merged_into?: string;
  created_at: string;
  updated_at?: string;
}

export interface BuitreDetail {
  id: string;
  person_id: string;
  content: string;
  occurrence_count: number;
  is_verified: boolean;
}

export interface BuitreComment {
  id: string;
  person_id: string;
  content: string;
  author_fingerprint: string;
  likes_count: number;
  created_at: string;
}

export interface BuitreSongNote {
  id: string;
  person_id: string;
  track_data: {
    id?: string; // Optional for text notes
    name?: string;
    artists?: string[];
    image?: string;
    preview_url?: string;
    album?: string;
    type?: 'text' | 'song';
    bg_color?: string; // For text notes
  };
  dedication?: string;
  created_at: string;
  expires_at: string;
}

import { AuthService } from './auth';

@Injectable({
  providedIn: 'root'
})
export class BuitresService {
  private supabase: SupabaseClient;
  private apiUrl = `${environment.apiUrl}/api/buitres`;

  constructor(private http: HttpClient, private authService: AuthService) {
    // Keep supabase for realtime subscriptions ONLY
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }
  
  // --- Song Notes Operations ---

  getSongNotes(personId: string): Observable<BuitreSongNote[]> {
    return this.http.get<BuitreSongNote[]>(`${this.apiUrl}/people/${personId}/songs`, { headers: this.getAuthHeaders() });
  }

  addSongNote(personId: string, trackData: any, dedication: string, type: 'song' | 'text' = 'song', bgColor: string = ''): Observable<BuitreSongNote> {
    return this.http.post<BuitreSongNote>(`${this.apiUrl}/people/${personId}/songs`, { 
      track_data: trackData, 
      dedication,
      type,
      bg_color: bgColor
    }, { headers: this.getAuthHeaders() });
  }
  
  deleteSongNote(noteId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/songs/${noteId}`, { headers: this.getAuthHeaders() });
  }

  searchSongs(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/api/search`, { 
      params: { q: query },
      headers: this.getAuthHeaders()
    });
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = this.authService.getBuitresToken();
    const headers: { [header: string]: string } = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // --- People Operations ---

  getPeople(search: string = '', sortBy: 'likes' | 'comments' | 'tags' | 'recent' | 'notes' = 'recent'): Observable<BuitrePerson[]> {
    let params = new HttpParams()
      .set('search', search)
      .set('sortBy', sortBy);
    
    return this.http.get<BuitrePerson[]>(`${this.apiUrl}/people`, { params, headers: this.getAuthHeaders() });
  }

  getTotalPeopleCount(): Observable<number> {
    return this.http.get<{count: number}>(`${this.apiUrl}/people/count`, { headers: this.getAuthHeaders() })
      .pipe(map(res => res.count));
  }

  getPersonById(id: string): Observable<BuitrePerson | null> {
    return this.http.get<BuitrePerson>(`${this.apiUrl}/people/${id}`, { headers: this.getAuthHeaders() });
  }

  createPerson(name: string, description: string, gender: string, email: string = ''): Observable<any> {
    return this.http.post(`${this.apiUrl}/people`, { name, description, gender, email }, { headers: this.getAuthHeaders() });
  }

  updatePerson(id: string, updates: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/people/${id}`, updates, { headers: this.getAuthHeaders() });
  }

  deletePerson(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/people/${id}`, { headers: this.getAuthHeaders() });
  }

  // --- Details Operations ---

  getDetails(personId: string): Observable<BuitreDetail[]> {
    return this.http.get<BuitreDetail[]>(`${this.apiUrl}/people/${personId}/details`, { headers: this.getAuthHeaders() });
  }

  addOrIncrementDetail(personId: string, content: string, fingerprint: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/people/${personId}/details`, { content, fingerprint }, { headers: this.getAuthHeaders() });
  }

  deleteDetail(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/details/${id}`, { headers: this.getAuthHeaders() });
  }

  // --- Comments Operations ---

  getComments(personId: string): Observable<BuitreComment[]> {
    return this.http.get<BuitreComment[]>(`${this.apiUrl}/people/${personId}/comments`, { headers: this.getAuthHeaders() });
  }

  addComment(personId: string, content: string, fingerprint: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/people/${personId}/comments`, { content, fingerprint }, { headers: this.getAuthHeaders() });
  }

  deleteComment(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/comments/${id}`, { headers: this.getAuthHeaders() });
  }

  likeComment(commentId: string, fingerprint: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/comments/${commentId}/like`, { fingerprint }, { headers: this.getAuthHeaders() });
  }

  // --- Interaction Operations ---

  votePerson(personId: string, type: 'like' | 'dislike', fingerprint: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/people/${personId}/vote`, { type, fingerprint }, { headers: this.getAuthHeaders() });
  }

  mergePersons(keepId: string, removeId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/merge`, { keepId, removeId }, { headers: this.getAuthHeaders() });
  }

  // --- Realtime Subscriptions ---
  subscribeToChanges(table: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  }

  // --- File Upload ---
  uploadImage(file: File): Observable<{ url: string, filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string, filename: string }>(`${environment.apiUrl}/api/upload`, formData);
  }
}
