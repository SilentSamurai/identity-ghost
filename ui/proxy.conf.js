const PROXY_CONFIG = [
    {
        context: ["/api"],
        target: "http://localhost:9001/",
        secure: false,
        changeOrigin: true,
        logLevel: "debug"
    },
    {
        context: function (pathname) {
            return pathname.includes('/.well-known/');
        },
        target: "http://localhost:9001/",
        secure: false,
        changeOrigin: true,
        logLevel: "debug"
    },
    {
        context: ["/onboard/tenant"],
        target: "http://localhost:9001/",
        secure: false,
        changeOrigin: true,
        logLevel: "debug",
        bypass: function (req, res, proxyOptions) {
            if (req.method === 'POST') {
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({
                    appNames: []
                }));
                return true;
            }
        }
    },
    {
        context: ["/offboard/tenant"],
        target: "http://localhost:9001/",
        secure: false,
        changeOrigin: true,
        logLevel: "debug",
        bypass: function (req, res, proxyOptions) {
            if (req.method === 'POST') {
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({
                    appNames: []
                }));
                return true;
            }
        }
    }
];

module.exports = PROXY_CONFIG;
