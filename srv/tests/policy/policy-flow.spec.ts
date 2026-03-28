/**
 * Tests the end-to-end policy enforcement flow.
 *
 * Creates a role, assigns it to a user, attaches a policy (allow Read on "secure-resource"
 * with conditions), then fetches a client_credentials token and verifies the policy appears
 * in the tenant-level permission query for that user.
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {PolicyClient} from "../api-client/policy-client";
import {TokenFixture} from "../token.fixture";
import {TenantClient} from "../api-client/tenant-client";
import {UsersClient} from "../api-client/user-client";
import {Action, Effect} from "../../src/casl/actions.enum";

describe('Policy Flow (e2e)', () => {
    let app: SharedTestFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    it('test policy flow', async () => {

        const tokenFixture = new TokenFixture(app);
        let tokenResponse = await tokenFixture.fetchAccessToken(
            "admin@shire.local",
            "admin9000",
            "shire.local"
        );
        let accessToken = tokenResponse.accessToken;
        let policyClient = new PolicyClient(app, accessToken);
        const tenantClient = new TenantClient(app, accessToken);
        const usersClient = new UsersClient(app, accessToken);

        const tenant = await tenantClient.getTenantDetails(null);
        const user = await usersClient.getMe();

        let role = await tenantClient.createRole(tenant.id, "TEST_ROLE");

        const roles = await tenantClient.getMemberRoles(tenant.id, user.id);
        roles.push(role);

        await tenantClient.updateMemberRoles(tenant.id, user.id, roles.map(r => r.name));

        const newPolicy = await policyClient.createAuthorization(
            role.id,
            Effect.ALLOW,
            Action.Read,
            "secure-resource",
            {public: false}
        );

        const credential = await tenantClient.getTenantCredentials(tenant.id);

        const ccTr = await tokenFixture.fetchClientCredentialsToken(
            credential.clientId,
            credential.clientSecret
        );
        accessToken = ccTr.accessToken;

        policyClient = new PolicyClient(app, accessToken);

        // 6) Check if user permission now includes that policy
        const myPolicies = await policyClient.getTenantPermissions("admin@shire.local");
        expect(myPolicies).toBeDefined();
        expect(Array.isArray(myPolicies)).toBe(true);
        expect(myPolicies.length).toBeGreaterThan(0);

        // Confirm at least one of them matches the newly created policy
        const foundPolicy = myPolicies.find(auth => auth.subject === newPolicy.subject);
        expect(foundPolicy).toBeDefined();
        expect(foundPolicy.action).toBe(Action.Read);
        expect(foundPolicy.subject).toBe(newPolicy.subject);
        expect(foundPolicy.conditions).toBeDefined()
        expect(foundPolicy.conditions.public).toBeDefined()
        expect(foundPolicy.conditions.public).toBe(false);
    });

});
