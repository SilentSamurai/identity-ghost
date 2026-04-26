import {Component, OnInit} from '@angular/core';
import {SessionService} from '../_services/session.service';

@Component({
    selector: 'app-profile',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card>
            <div *ngIf="currentUser; else loggedOut">
                <header class="jumbotron">
                    <div class="display-6">
                        <strong>{{ currentUser.name }}</strong>'s Profile
                    </div>
                </header>
                <br>
                <ul class="list-group">
                    <li class="list-group-item">
                        Email
                        <div>
                            <strong>{{ currentUser.email }}</strong>
                        </div>
                    </li>
                    <li class="list-group-item">
                        Name
                        <div>
                            <strong>{{ currentUser.name }}</strong>
                        </div>
                    </li>
                    <li class="list-group-item">
                        Tenant Id
                        <div>
                            <strong>{{ currentUser.tenant.id }}</strong>
                        </div>
                    </li>
                    <li class="list-group-item">
                        Tenant Name
                        <div>
                            <strong>{{ currentUser.tenant.name }}</strong>
                        </div>
                    </li>
                    <li class="list-group-item">
                        Tenant Domain
                        <div>
                            <strong>{{ currentUser.tenant.domain }}</strong>
                        </div>
                    </li>
                    <li class="list-group-item">
                        Roles
                        <div>
                            <ul>
                                <li *ngFor="let role of currentUser.scopes">
                                    <strong><code>{{ currentUser.tenant.name }}::{{ role }}</code></strong>
                                </li>
                            </ul>
                        </div>
                    </li>
                </ul>
            </div>

            <ng-template #loggedOut>
                Please login.
            </ng-template>
        </app-centered-card>
    `,
    styles: [`
        /* Profile component specific styles */
        .profile-container {
            padding: 20px;
        }

        .profile-header {
            margin-bottom: 20px;
        }

        .profile-details {
            margin-top: 20px;
        }

        .profile-actions {
            margin-top: 30px;
        }
    `],
})
export class ProfileComponent implements OnInit {
    currentUser: any;
    token: any;

    constructor(private tokenStorageService: SessionService) {
    }

    ngOnInit(): void {
        this.currentUser = this.tokenStorageService.getUser();
        this.token = this.tokenStorageService.getToken();
        console.log(this.currentUser);
    }
}
