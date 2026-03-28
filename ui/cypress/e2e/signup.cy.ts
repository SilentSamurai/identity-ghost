/**
 * User Sign-Up Tests
 *
 * Tests the /signup page where users join an existing tenant.
 * Requires a client_id query param to identify the tenant.
 * Verifies error when client_id is missing, successful signup,
 * email verification via fake SMTP, and login after verification.
 */
describe('Sign Up', () => {
    function uniqueEmail() {
        return `testuser_${Date.now()}@mail.com`;
    }

    // Visits /signup without a client_id and verifies an error alert is shown
    it('Should show an error when client_id is missing', () => {
        cy.visit('/signup');
        cy.contains('.alert.alert-danger', 'client_id').should('be.visible');
        cy.get('form').should('not.exist');
    });

    // Signs up with a valid client_id, fills the form, and verifies the success message
    it('Should allow signup when client_id is provided via query', () => {
        const email = uniqueEmail();
        cy.visit('/signup?client_id=shire.local');

        cy.get('input#name').should('be.visible').type('Test User');
        cy.get('input#email').type(email);
        cy.get('input#password').type('testpass123');
        cy.intercept('POST', '**/api/signup*').as('signUp');
        cy.contains('button', 'Sign Up').click();
        cy.wait('@signUp').should(({ response }) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });
        cy.contains('Sign up successful! Please verify your email, then try logging in again.').should('exist');
    });

    // Full flow: signs up, fetches the verification email from fake SMTP,
    // clicks the verification link, then logs in with the new credentials
    it('Should send verification email (via control API), verify, then login', () => {
        const SMTP_SERVER = 'http://127.0.0.1:8899/__test__/emails';
        const email = uniqueEmail();
        const password = 'testpass123';

        // Clear inbox
        cy.request('POST', `${SMTP_SERVER}/clear`);

        // Visit with client_id preset
        cy.visit('/signup?client_id=shire.local');

        // Fill details and submit
        cy.get('input#name').type('Test User');
        cy.get('input#email').type(email);
        cy.get('input#password').type(password);
        cy.intercept('POST', '**/api/signup*').as('signUp');
        cy.contains('button', 'Sign Up').click();
        cy.wait('@signUp').should(({ response }) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        // Fetch latest email and visit verification link (normalize https->http locally)
        cy.request({
            url: `${SMTP_SERVER}/latest`,
            qs: { to: email, subject: 'Thank you for signing up', timeoutMs: 15000 }
        }).then(({ body }) => {
            expect(body.links && body.links.length).to.be.greaterThan(0);
            const raw = body.links.find((l: string) => !l.endsWith(']')) || body.links[0];
            const verifyUrl = (raw || '').replace(/\]$/, '');
            const normalized = verifyUrl.replace(/^https:\/\//, 'http://');
            cy.request({ url: normalized, followRedirect: false, failOnStatusCode: false })
              .its('status')
              .should('eq', 302);
        });

        // Now login
        cy.visit('/login?client_id=shire.local');
        cy.get('input#username').type(email);
        cy.get('input#password').type(password);
        cy.get('#login-btn').click();
        cy.url().should('include', '/home');
    });
});
