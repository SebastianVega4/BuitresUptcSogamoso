import { Component } from '@angular/core';
import { RouterModule } from "@angular/router";
import { CommonModule } from '@angular/common';
import { PrivateChatComponent } from "./components/private-chat/private-chat.component";
import { ModalComponent } from './components/modal/modal.component';
import { AuthService } from './services/auth';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
  imports: [RouterModule, CommonModule, PrivateChatComponent, ModalComponent],
})
export class AppComponent {
  title = 'Buitres UPTC';
  isMenuOpen = false;
  isLoggedIn = false;

  constructor(private authService: AuthService) {
    this.isLoggedIn = this.authService.isBuitresLoggedIn();
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }
}
