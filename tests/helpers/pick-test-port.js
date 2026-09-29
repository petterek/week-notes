const { spawnSync } = require('node:child_process');

function canBind(port) {
    const probe = spawnSync(process.execPath, ['-e', `
        const net = require('node:net');
        const port = Number(process.argv[1]);
        const server = net.createServer();
        let done = false;
        function finish(code) {
            if (done) return;
            done = true;
            try { server.close(); } catch {}
            process.exit(code);
        }
        server.once('error', (err) => finish(err && err.code === 'EADDRINUSE' ? 1 : 2));
        server.listen({ host: '127.0.0.1', port, exclusive: true }, () => finish(0));
    `, String(port)], {
        stdio: 'ignore',
    });
    return probe.status === 0;
}

function parseCandidatePorts(preferredPort, extraPorts = []) {
    const ports = [];
    const seen = new Set();
    for (const raw of [preferredPort, ...extraPorts]) {
        const n = Number.parseInt(String(raw), 10);
        if (!Number.isFinite(n) || n <= 0 || n > 65535) continue;
        if (n === 3001) continue;
        if (seen.has(n)) continue;
        seen.add(n);
        ports.push(n);
    }
    return ports;
}

function pickTestPort(options = {}) {
    const preferredPort = Number.parseInt(String(options.preferredPort || 3101), 10) || 3101;
    const candidatePorts = parseCandidatePorts(preferredPort, options.extraPorts);
    for (const port of candidatePorts) {
        if (canBind(port)) return port;
    }
    return null;
}

module.exports = { pickTestPort };
