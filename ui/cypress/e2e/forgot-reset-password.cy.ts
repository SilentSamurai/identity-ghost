/// <reference types="cypress" />

// Configuration assumptions:
// - UI runs at http://localhost:4200
// - API server runs at http://localhost:9001
// - Fake SMTP control server runs at http://127.0.0.1:8899 (from FakeSmtpServer.ts defaults)
// - Service name is "Auth Server" (used in mail subjects)

function extractFirstLinkFromEmail(email: any): string | null {
    const links: string[] = email.links || [];
    if (!links.length) return null;
    // Clean trailing punctuation that may be added by email rendering
    return links[0].replace(/[\]\)>]+$/g, "");
}

function normalizeDevLink(link: string): string {
    try {
        const u = new URL(link);
        if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.protocol === 'https:') {
            u.protocol = 'http:';
            u.port = '4200';
        }
        return u.toString();
    } catch {
        return link;
    }
}
/**
 * Forgot/Reset Password Flow Test
 *
 * End-to-end test for the password reset flow:
 * 1. Creates a user via the signup API and verifies their email
 * 2. Navigates to /forgot-password, submits the reset request
 * 3. Fetches the reset email from the fake SMTP server
 * 4. Visits the reset link, sets a new password
 * 5. Verifies the success message
 */
describe("Forgot/Reset Password (UI)", () => {
    // Full flow: create user → verify email → request reset → fetch reset email →
    // set new password → verify success
    it("should allow a user to request reset and set a new password", () => {
        const unique = Date.now();
        const email = `ui-forgot-reset-${unique}@test.com`;
        const originalPassword = "OrigPassw0rd";
        const newPassword = "NewPassw0rd";

        // 1) Create user via public API
        cy.request({
            method: "POST",
            url: "http://localhost:9001/api/signup",
            body: {
                name: "UI Forgot Reset User",
                email,
                password: originalPassword,
                client_id: "shire.local",
            },
            headers: { Accept: "application/json" },
        }).its("status").should("be.oneOf", [200, 201]);

        // 2) Verify email via SMTP control (get latest verification mail and open link)
        cy.request({
            method: "GET",
            url: `http://127.0.0.1:8899/__test__/emails/latest`,
            qs: { to: email, subject: "Thank you for signing up" },
            failOnStatusCode: false,
        }).then((res) => {
            expect(res.status).to.be.oneOf([200, 201]);
            const link = extractFirstLinkFromEmail(res.body);
            const verificationUrl = normalizeDevLink(String(link));
            expect(verificationUrl, "verification link").to.match(/^https?:\/\//);
            // Always hit verification via API request, then continue the flow in the UI
            cy.request({ method: 'GET', url: verificationUrl, followRedirect: false, failOnStatusCode: false })
              .its('status').should('eq', 302);
            // After API verification, go to login UI to proceed
            cy.visit('/login?client_id=shire.local');
            cy.url().should('include', '/login');
        });

        // 3) Start from Login (like other tests), navigate to Forgot Password, and submit
        cy.visit('/login?client_id=shire.local');
        cy.contains('a', 'Forgot Password').click();
        cy.url().should('include', '/forgot-password');
        cy.get("input#email").clear().type(email);
        cy.contains("button", "Send Reset Instructions").click();
        cy.get(".alert-success").should("contain.text", "Check Your Email");

        // 4) Fetch reset password email, extract link, visit UI reset page
        cy.request({
            method: "GET",
            url: `http://127.0.0.1:8899/__test__/emails/latest`,
            qs: { to: email, subject: "Reset your password" },
            failOnStatusCode: false,
        }).then((res) => {
            expect(res.status).to.be.oneOf([200, 201]);
            const resetLink = extractFirstLinkFromEmail(res.body) as string;
            expect(resetLink, "reset link").to.be.a("string");

            // 5) Complete reset in the UI by opening the link directly
            cy.visit(normalizeDevLink(resetLink));
            cy.get("input#password").clear().type(newPassword);
            cy.get("input#confirmPassword").clear().type(newPassword);
            cy.contains("button", "Reset Password").click();

            // 6) Expect success message
            cy.get(".alert-success").should("contain.text", "Password Reset Successful");
        });
    });
});
