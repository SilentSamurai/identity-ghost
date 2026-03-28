import {Component} from '@angular/core';

@Component({
    selector: 'admin-layout',
    template: `
        <admin-nav-bar></admin-nav-bar>
        <router-outlet></router-outlet>
    `,
})
export class AdminLayoutComponent {
}
