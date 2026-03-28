export type TableState<T = any> =
    | { kind: 'loading' }
    | { kind: 'data'; rows: T[]; loadingMore: boolean }
    | { kind: 'empty' }
    | { kind: 'error'; message: string };
