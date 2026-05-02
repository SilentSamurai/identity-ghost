const http = require('http');
const fs = require('fs');
const path = require('path');
const {parse} = require("node:url");
const {assert} = require('node:console');

// Store onboard and offboard requests for verification
const onboardRequests = [];
const offboardRequests = [];

const server = http.createServer((req, res) => {
    // Get the file path from the request URL
    let parsedUrl = parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // Handle onboard endpoint
    if (pathname === '/api/onboard/tenant') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);

                // Get token from Authorization header
                let token = null;
                if (req.headers && req.headers.authorization) {
                    const parts = req.headers.authorization.split(' ');
                    if (parts.length === 2 && parts[0] === 'Bearer') {
                        token = parts[1];
                    }
                }
                if (!token) {
                    res.writeHead(401, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({error: 'Missing or invalid Authorization header'}));
                    return;
                }
                const tenantId = data.tenantId;
                const timestamp = new Date().toISOString();
                // Verify token before proceeding
                try {
                    await verifyToken(token);
                } catch (err) {
                    console.error('Token verification failed:', err);
                    res.writeHead(401, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({error: 'Token verification failed', details: err}));
                    return;
                }

                // Log detailed information about the onboard request
                console.log(`[${timestamp}] Received onboard request:`);
                console.log(`  - Tenant ID: ${tenantId}`);
                console.log(`  - Method: ${req.method}`);
                console.log(`  - Headers:`, req.headers);

                // Store the request for verification
                onboardRequests.push({
                    tenantId,
                    timestamp,
                    method: req.method,
                    headers: req.headers
                });

                // Return success response
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({appNames: []}));
            } catch (error) {
                console.error('Error processing onboard request:', error);
                res.writeHead(400, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({error: 'Invalid request body'}));
            }
        });
        return;
    }

    // Handle offboard endpoint
    if (pathname.startsWith('/api/offboard/tenant')) {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);

                // Get token from Authorization header
                let token = null;
                if (req.headers && req.headers.authorization) {
                    const parts = req.headers.authorization.split(' ');
                    if (parts.length === 2 && parts[0] === 'Bearer') {
                        token = parts[1];
                    }
                }
                if (!token) {
                    res.writeHead(401, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({error: 'Missing or invalid Authorization header'}));
                    return;
                }
                const tenantId = data.tenantId;
                const timestamp = new Date().toISOString();
                // Verify token before proceeding
                try {
                    await verifyToken(token);
                } catch (err) {
                    console.error('Token verification failed:', err);
                    res.writeHead(401, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({error: 'Token verification failed', details: err}));
                    return;
                }

                // Log detailed information about the offboard request
                console.log(`[${timestamp}] Received offboard request:`);
                console.log(`  - Tenant ID: ${tenantId}`);
                console.log(`  - Method: ${req.method}`);
                console.log(`  - Headers:`, req.headers);

                // Store the request for verification
                offboardRequests.push({
                    tenantId,
                    timestamp,
                    method: req.method,
                    headers: req.headers
                });

                // Return success response
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({appNames: []}));
            } catch (error) {
                console.error('Error processing offboard request:', error);
                res.writeHead(400, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({error: 'Invalid request body'}));
            }
        });
        return;
    }

    // Add endpoint to get onboard request history
    if (pathname === '/onboard/history') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(onboardRequests));
        return;
    }

    // Add endpoint to get offboard request history
    if (pathname === '/offboard/history') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(offboardRequests));
        return;
    }

    // Add endpoint to check if a specific tenant was onboarded
    if (pathname.startsWith('/onboard/check/')) {
        const tenantId = pathname.split('/').pop();
        const requests = onboardRequests.filter(req => req.tenantId === tenantId);

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            wasOnboarded: requests.length > 0,
            requestCount: requests.length,
            requests: requests
        }));
        return;
    }

    // Add endpoint to check if a specific tenant was offboarded
    if (pathname.startsWith('/offboard/check/')) {
        const tenantId = pathname.split('/').pop();
        const requests = offboardRequests.filter(req => req.tenantId === tenantId);

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            wasOffboarded: requests.length > 0,
            requestCount: requests.length,
            requests: requests
        }));
        return;
    }

    // Add endpoint to check if a tenant was onboarded and then offboarded
    if (pathname.startsWith('/tenant/lifecycle/')) {
        const tenantId = pathname.split('/').pop();
        const tenantOnboardRequests = onboardRequests.filter(req => req.tenantId === tenantId);
        const tenantOffboardRequests = offboardRequests.filter(req => req.tenantId === tenantId);

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            tenantId,
            wasOnboarded: tenantOnboardRequests.length > 0,
            onboardCount: tenantOnboardRequests.length,
            wasOffboarded: tenantOffboardRequests.length > 0,
            offboardCount: tenantOffboardRequests.length,
            onboardRequests: tenantOnboardRequests,
            offboardRequests: tenantOffboardRequests
        }));
        return;
    }

    // Remove URL parameters
    let filePath = '.' + pathname.split('?')[0];

    // If the requested path is a directory, serve index.html by default
    if (filePath === './') {
        filePath = './index.html';
    }

    // Construct the absolute path to the file
    filePath = path.resolve(filePath);
    console.log(`Serving : ${filePath}`);

    // Check if the file exists
    fs.exists(filePath, (exists) => {
        if (exists) {
            // Read the file
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    // Error reading the file
                    res.writeHead(500);
                    res.end('Error reading the file');
                } else {
                    // Serve the file with appropriate content type
                    const contentType = getContentType(filePath);
                    res.writeHead(200, {'Content-Type': contentType});
                    res.end(data);
                }
            });
        } else {
            // File not found
            res.writeHead(404);
            res.end('File not found');
        }
    });
});

// Minimal helper to verify a JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;

        // Convert Base64Url to Base64
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

        // Decode the Base64 string to JSON
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Invalid JWT:', e);
        return null;
    }
}


async function verifyToken(token) {
    const decoded = parseJwt(token);
    assert(decoded != null, 'Failed to decode token');
    assert(decoded.sub != undefined, 'Missing sub claim');
    assert(decoded.exp != undefined, 'Missing exp claim');
    assert(decoded.iat != undefined, 'Missing iat claim');
    assert(decoded.iss != undefined, 'Missing iss claim');
    assert(decoded.aud != undefined, 'Missing aud claim');
    assert(decoded.grant_type === "client_credentials", 'Invalid grant type');
    assert(decoded.tenant_id != undefined, 'Missing tenant_id claim');
    assert(decoded.scope != undefined, 'Missing scope claim');
    // Verify token is not expired
    const now = Math.floor(Date.now() / 1000);
    assert(decoded.exp > now, 'Token is expired');
}

// Helper function to determine the content type based on file extension
function getContentType(filePath) {
    const extname = path.extname(filePath);
    switch (extname) {
        case '.html':
            return 'text/html';
        case '.js':
            return 'text/javascript';
        case '.css':
            return 'text/css';
        case '.json':
            return 'application/json';
        case '.png':
            return 'image/png';
        case '.jpg':
            return 'image/jpg';
        case '.gif':
            return 'image/gif';
        default:
            return 'application/octet-stream';
    }
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Onboard request history available at http://localhost:${PORT}/onboard/tenant`);
    console.log(`Offboard request history available at http://localhost:${PORT}/offboard/tenant`);
    console.log(`Check tenant lifecycle at http://localhost:${PORT}/tenant/lifecycle/{tenantId}`);
});
