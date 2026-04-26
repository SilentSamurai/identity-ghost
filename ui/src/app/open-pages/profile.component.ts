import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {SessionService} from '../_services/session.service';

@Component({
    selector: 'app-profile',
    template: `
        <div class="modal-header">
            <h5 class="modal-title">{{ currentUser?.name }}'s Profile</h5>
            <button type="button" class="btn-close" aria-label="Close" (click)="activeModal.dismiss()"></button>
        </div>
        <div class="modal-body" *ngIf="currentUser; else loggedOut">
            <ul class="list-group">
                <li class="list-group-item">
                    Email
                    <div><strong>{{ currentUser.email }}</strong></div>
                </li>
                <li class="list-group-item">
                    Name
                    <div><strong>{{ currentUser.name }}</strong></div>
                </li>
                <li class="list-group-item">
                    Tenant Id
                    <div><strong>{{ currentUser.tenant.id }}</strong></div>
                </li>
                <li class="list-group-item">
                    Tenant Name
                    <div><strong>{{ currentUser.tenant.name }}</strong></div>
                </li>
                <li class="list-group-item">
                    Tenant Domain
                    <div><strong>{{ currentUser.tenant.domain }}</strong></div>
                </li>
                <li class="list-group-item">
                    Roles
                    <div>
                        <ul>
                            <li *ngFor="let role of currentUser.roles">
                                <strong><code>{{ currentUser.tenant.name }}::{{ role }}</code></strong>
                            </li>
                        </ul>
                    </div>
                </li>
            </ul>
        </div>
        <ng-template #loggedOut>
            <div class="modal-body">Please login.</div>
        </ng-template>
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

    constructor(public activeModal: NgbActiveModal, private tokenStorageService: SessionService) {
    }

    ngOnInit(): void {
        this.currentUser = this.tokenStorageService.getUser();
        this.token = this.tokenStorageService.getToken();
        console.log(this.currentUser);
    }
}
