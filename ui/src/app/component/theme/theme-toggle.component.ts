import {Component} from '@angular/core';
import {ThemeService} from './theme.service';

@Component({
    selector: 'app-theme-toggle',
    template: `
        <button class="btn btn-link" (click)="toggleTheme()" aria-label="Toggle theme">
            <i
                class="pi"
                [class.pi-moon]="!(themeService.darkMode$ | async)"
                [class.pi-sun]="themeService.darkMode$ | async"
            ></i>
        </button>
    `,
    styles: [
        `
            .btn-link {
                color: var(--bs-body-color);
                text-decoration: none;
                padding: 0.5rem;
            }

            .btn-link:hover {
                color: var(--bs-primary);
            }
        `,
    ],
})
export class ThemeToggleComponent {
    constructor(public themeService: ThemeService) {
    }

    toggleTheme() {
        this.themeService.toggleTheme();
    }
}
