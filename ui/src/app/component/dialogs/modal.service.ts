import {Injectable} from '@angular/core';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';

export enum ModalReturnStatus {
    OK = "Ok",
    USER_CLOSED = "UserClosed",
}

export class ModalResult<T> {
    data: T | undefined;
    status: ModalReturnStatus = ModalReturnStatus.OK;

    constructor(data: T | undefined, status: ModalReturnStatus) {
        this.data = data;
        this.status = status;
    }

    is_ok() {
        return this.status == ModalReturnStatus.OK;
    }
}

export class ModalConfig {
    initData: any = {};
}

export interface AfterModalInit {
    onModalInit(): void;
}

@Injectable({
    providedIn: 'root',
})
export class ModalService {
    constructor(private modalService: NgbModal) {
    }

    initialize(initData: any, componentRef: any) {
        console.log('ModalService.initialize called with:', initData);
        for (let key in initData) {
            console.log(`Setting ${key} =`, initData[key]);
            componentRef[key] = initData[key];
        }
    }

    async open<R>(
        content: any,
        options?: ModalConfig,
    ): Promise<ModalResult<R>> {
        const modal = this.modalService.open(content, {
            backdrop: 'static',
            size: 'lg',
        });
        // initialize fields
        this.initialize(options?.initData, modal.componentInstance);
        // on modal init function
        const instance: AfterModalInit = modal.componentInstance;
        if (instance.onModalInit) {
            instance.onModalInit();
        }
        // result
        const result: R = await modal.result;
        if (
            result === 'Cross click' ||
            result == ModalReturnStatus.USER_CLOSED
        ) {
            return new ModalResult(result, ModalReturnStatus.USER_CLOSED);
        }
        return new ModalResult(result, ModalReturnStatus.OK);
    }
}
