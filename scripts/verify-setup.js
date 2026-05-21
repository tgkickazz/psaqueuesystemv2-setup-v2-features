require('dotenv').config();
const http = require('http');

const checks = [];

function ok(name) {
    checks.push({ name, pass: true });
    console.log(`OK  ${name}`);
}

function fail(name, detail) {
    checks.push({ name, pass: false, detail });
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
}

try {
    require('express');
    require('mongodb');
    require('socket.io');
    ok('Node dependencies (dotenv, express, mongodb, socket.io)');
} catch (err) {
    fail('Node dependencies', err.message);
}

if (process.env.MONGODB_URI) {
    ok('MONGODB_URI in .env');
} else {
    fail('MONGODB_URI in .env', 'Copy .env.example to .env and set your Atlas connection string');
}

const port = Number(process.env.PORT) || 3000;

function request(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: 5000
            },
            (res) => {
                let raw = '';
                res.on('data', (chunk) => { raw += chunk; });
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, json: JSON.parse(raw) });
                    } catch {
                        reject(new Error(`Invalid JSON from ${path}`));
                    }
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
        });
        req.write(data);
        req.end();
    });
}

(async () => {
    try {
        const role = await request('/api/get-role', { email: 'admin.test@gmail.com' });
        if (role.status === 200 && role.json.role === 'admin') {
            ok('API /api/get-role (admin.test@gmail.com -> admin)');
        } else {
            fail('API /api/get-role', JSON.stringify(role.json));
        }

        const session = await request('/api/session-status', { email: 'admin.test@gmail.com' });
        if (session.status === 200 && session.json.success) {
            ok('API /api/session-status');
        } else {
            fail('API /api/session-status', JSON.stringify(session.json));
        }
    } catch (err) {
        fail('Server APIs', `Start the server first (npm start). ${err.message}`);
    }

    const failed = checks.filter((c) => !c.pass);
    if (failed.length) {
        console.error(`\n${failed.length} check(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll checks passed. Open http://localhost:3000/login.html');
})();
