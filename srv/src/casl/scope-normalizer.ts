export class ScopeNormalizer {
    /** Split a space-delimited scope string into a deduplicated, sorted array */
    static parse(scopeString: string | null | undefined): string[] {
        if (!scopeString) {
            return [];
        }
        return Array.from(new Set(scopeString.trim().split(/\s+/)))
            .filter(s => s.length > 0)
            .sort();
    }

    /** Join a scope array into a normalized space-delimited string */
    static format(scopes: string[]): string {
        return Array.from(new Set(scopes))
            .filter(s => s.length > 0)
            .sort()
            .join(' ');
    }

    /** Normalize a scope string: parse then format (idempotent) */
    static normalize(scopeString: string | null | undefined): string {
        return this.format(this.parse(scopeString));
    }

    /** Compute intersection of two scope arrays */
    static intersect(a: string[], b: string[]): string[] {
        const setB = new Set(b);
        return Array.from(new Set(a.filter(x => setB.has(x)))).sort();
    }

    /** Compute union of two scope arrays */
    static union(a: string[], b: string[]): string[] {
        return Array.from(new Set([...a, ...b]))
            .filter(s => s.length > 0)
            .sort();
    }

    /** Validate that a scope string contains only valid NQSCHAR characters per RFC 6749 §3.3 */
    static validate(scopeString: string | null | undefined): boolean {
        if (!scopeString) {
            return true;
        }
        // NQSCHAR = %x20-21 / %x23-5B / %x5D-7E
        // Printable ASCII excluding backslash (\) and double-quote (")
        // Space is allowed as delimiter
        const nqscharRegex = /^[\x20-\x21\x23-\x5B\x5D-\x7E]*$/;
        return nqscharRegex.test(scopeString);
    }
}
