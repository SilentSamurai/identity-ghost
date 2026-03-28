import {
    Directive,
    ElementRef,
    EventEmitter,
    NgZone,
    AfterViewInit,
    OnDestroy,
    Output,
} from '@angular/core';

/**
 * Attach to a scrollable container. Emits `reachedEnd` when the user
 * scrolls to within 10px of the bottom.
 */
@Directive({
    selector: '[appInfiniteScroll]',
})
export class InfiniteScrollDirective implements AfterViewInit, OnDestroy {
    @Output() reachedEnd = new EventEmitter<void>();

    private listener: (() => void) | null = null;

    constructor(
        private el: ElementRef<HTMLElement>,
        private zone: NgZone,
    ) {}

    ngAfterViewInit(): void {
        const container = this.el.nativeElement;

        // Run outside Angular zone to avoid triggering change detection on every scroll
        this.zone.runOutsideAngular(() => {
            this.listener = () => {
                const threshold = 10;
                const reachedEnd =
                    container.offsetHeight + container.scrollTop >=
                    container.scrollHeight - threshold;

                if (reachedEnd) {
                    this.zone.run(() => this.reachedEnd.emit());
                }
            };
            container.addEventListener('scroll', this.listener, {passive: true});
        });
    }

    ngOnDestroy(): void {
        if (this.listener) {
            this.el.nativeElement.removeEventListener('scroll', this.listener);
        }
    }
}
