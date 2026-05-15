export function deriveSlug(name: string): string {
    let s = name.toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, '-');
    s = s.replace(/^-+|-+$/g, '');
    return s;
}

export function buildAlias(slug: string, domain: string): string {
    return `${slug}.${domain.toLowerCase()}`;
}
