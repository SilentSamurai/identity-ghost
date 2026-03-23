import {Component} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';

@Component({
    selector: 'app-secret-display',
    template: `
        <app-standard-dialog title="Client Secret">
            <app-dialog-tab>
                <div class="alert alert-warning">
                    <i class="fa fa-warning me-1"></i>
                    This secret will not be shown again. Please copy and store it securely before closing this dialog.
                </div>
                <code>
                    <pre class="text-wrap text-break p-3 bg-body-secondary rounded">{{ clientSecret }}</pre>
                </code>
                <button
                    class="btn btn-outline-primary btn-sm"
                    (click)="copyToClipboard()"
                    type="button"
                >
                    <i class="fa fa-copy me-1"></i>
                    {{ copyLabel }}
                </button>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    class="btn btn-secondary"
                    (click)="activeModal.close()"
                    type="button"
                >
                    Close
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [''],
})
export class SecretDisplayComponent {
    clientSecret: string = '';
    copyLabel: string = 'Copy to Clipboard';

    constructor(public activeModal: NgbActiveModal) {
    }

    async copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.clientSecret);
            this.copyLabel = 'Copied!';
            setTimeout(() => {
                this.copyLabel = 'Copy to Clipboard';
            }, 2000);
        } catch (e) {
            // Fallback: select text for manual copy
            const pre = document.querySelector('pre');
            if (pre) {
                const range = document.createRange();
                range.selectNodeContents(pre);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        }
    }
}
