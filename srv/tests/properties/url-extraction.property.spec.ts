import * as fc from 'fast-check';
import {EmailResponse, SmtpClientAdapter} from '../smtp-client-adapter';

/**
 * Feature: shared-test-infrastructure, Property 4: URL extraction from email responses
 *
 * For any email response containing zero or more links and paths,
 * extractLinks() should return all links from the email response,
 * and extractPaths() should return all paths from the email response.
 *
 * Since extractLinks/extractPaths are pass-through methods that return
 * email.links and email.paths respectively, this property verifies
 * the adapter faithfully returns the data from the server response.
 *
 * Validates: Requirements 5.5
 */
describe('Property 4: URL extraction from email responses', () => {
    const adapter = new SmtpClientAdapter('http://127.0.0.1:0');

    const urlArb = fc.webUrl({withFragments: false, withQueryParameters: false});

    const pathArb = fc.array(
        fc.constantFrom('/', 'a', 'b', 'c', 'd', '1', '2', '-', '_'),
        {minLength: 1, maxLength: 10},
    ).map((chars) => {
        const s = chars.join('');
        return s.startsWith('/') ? s : '/' + s;
    });

    function makeEmail(links: string[], paths: string[]): EmailResponse {
        return {
            subject: 'test',
            to: {text: 'user@example.com'},
            from: {text: 'sender@example.com'},
            links,
            paths,
        };
    }

    it('extractLinks returns all links from the email response', () => {
        fc.assert(
            fc.property(
                fc.array(urlArb, {minLength: 0, maxLength: 10}),
                (links: string[]) => {
                    const email = makeEmail(links, []);
                    const result = adapter.extractLinks(email);
                    expect(result).toEqual(links);
                },
            ),
            {numRuns: 100},
        );
    });

    it('extractPaths returns all paths from the email response', () => {
        fc.assert(
            fc.property(
                fc.array(pathArb, {minLength: 0, maxLength: 10}),
                (paths: string[]) => {
                    const email = makeEmail([], paths);
                    const result = adapter.extractPaths(email);
                    expect(result).toEqual(paths);
                },
            ),
            {numRuns: 100},
        );
    });

    it('extractLinks and extractPaths return correct values from the same email', () => {
        fc.assert(
            fc.property(
                fc.array(urlArb, {minLength: 0, maxLength: 10}),
                fc.array(pathArb, {minLength: 0, maxLength: 10}),
                (links: string[], paths: string[]) => {
                    const email = makeEmail(links, paths);
                    expect(adapter.extractLinks(email)).toEqual(links);
                    expect(adapter.extractPaths(email)).toEqual(paths);
                },
            ),
            {numRuns: 100},
        );
    });
});
