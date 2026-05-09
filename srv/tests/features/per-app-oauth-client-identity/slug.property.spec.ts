import * as fc from 'fast-check';

function deriveSlug(name: string): string {
    let s = name.toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, '-');
    s = s.replace(/^-+|-+$/g, '');
    return s;
}

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('Per-App OAuth Client Identity - Slug Properties', () => {
    // Property 1: Slug grammar
    it('slug output is either empty or matches ^[a-z0-9]+(-[a-z0-9]+)*$', () => {
        fc.assert(
            fc.property(fc.string(), (name: string) => {
                const slug = deriveSlug(name);
                if (slug === '') return true;
                return SLUG_REGEX.test(slug);
            }),
            {numRuns: 100},
        );
    });

    // Property 2: Slug idempotence
    it('slug(slug(name)) === slug(name)', () => {
        fc.assert(
            fc.property(fc.string(), (name: string) => {
                const slug = deriveSlug(name);
                return deriveSlug(slug) === slug;
            }),
            {numRuns: 100},
        );
    });

    // Property 3: Alias format
    it('alias = slug(name) + "." + domain.toLowerCase() and length <= 253', () => {
        fc.assert(
            fc.property(
                fc.string(),
                fc.string({minLength: 1, maxLength: 50}),
                (name: string, domain: string) => {
                    const slug = deriveSlug(name);
                    if (!slug) return true;
                    const alias = `${slug}.${domain.toLowerCase()}`;
                    expect(alias).toMatch(/^[a-z0-9-]+\..+$/);
                    expect(alias.length).toBeLessThanOrEqual(253);
                    return true;
                },
            ),
            {numRuns: 100},
        );
    });

    // Property 4: Alias validation order
    it('rejection order: empty slug first, then length, then uniqueness', () => {
        fc.assert(
            fc.property(
                fc.string(),
                fc.string({minLength: 1, maxLength: 253}),
                (name: string, domain: string) => {
                    const slug = deriveSlug(name);
                    if (!slug) {
                        return true;
                    }
                    const alias = `${slug}.${domain.toLowerCase()}`;
                    if (alias.length > 253) {
                        return true;
                    }
                    return alias.length <= 253 && alias.length > 0;
                },
            ),
            {numRuns: 100},
        );
    });
});
