const express = require('express');
const path = require('path');
const http = require('http');
const os = require('os');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. CONFIGURATION ---
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000; 
const uri = "mongodb://deynyelicawalo_db_user:h9sM5NYNeO0R96vw@ac-bbriiqg-shard-00-00.yeogezu.mongodb.net:27017,ac-bbriiqg-shard-00-01.yeogezu.mongodb.net:27017,ac-bbriiqg-shard-00-02.yeogezu.mongodb.net:27017/?ssl=true&replicaSet=atlas-uamnqz-shard-0&authSource=admin&appName=Cluster0";
const client = new MongoClient(uri);

let db;
let adminOTPs = {};
let requeueTimers = {};

// --- 2. GLOBAL QUEUE STATE ---
let ticketSequences = { national: 1, civil: 1 };
let queueStore = {
    waiting: { national: [], civil: [] },
    currentServing: {
        national: { window1: null, window2: null, priorityWindow: null },
        civil: { window1: null, window2: null, priorityWindow: null }
    }
};
const activeUsers = {};

// --- 3. PERSISTENCE & LOGGING HELPERS ---
async function logEvent(collectionName, data) {
    if (!db) return;
    try {
        const entry = {
            timestamp_readable: new Date().toLocaleString('en-PH'),
            iso_timestamp: new Date(),
            ...data
        };
        await db.collection(collectionName).insertOne(entry);
    } catch (err) { console.error("Logging failed:", err); }
}

async function saveCurrentState() {
    if (!db) return;
    try {
        await db.collection('system_state').updateOne(
            { id: 'active_queue' },
            { $set: { queueStore, ticketSequences, lastUpdated: new Date() } },
            { upsert: true }
        );
    } catch (err) { console.error("Save state failed:", err); }
}

function cancelRequeueTimer(ticketLabel) {
    if (!ticketLabel) return;
    if (requeueTimers[ticketLabel]) {
        clearTimeout(requeueTimers[ticketLabel]);
        delete requeueTimers[ticketLabel];
    }
}

async function processExpiredRequeuedTickets() {
    const now = Date.now();
    let changed = false;
    const expiryMs = 600000;

    for (const dept of ['national', 'civil']) {
        const queue = queueStore.waiting[dept];
        for (let i = queue.length - 1; i >= 0; i--) {
            const ticket = queue[i];
            if (ticket?.requeueTime && now - ticket.requeueTime >= expiryMs) {
                queue.splice(i, 1);
                cancelRequeueTimer(ticket.label);
                await logEvent('ticket_logs', { label: ticket.label, department: dept, action: 'AUTO_TERMINATED_AFTER_REQUEUE', reason: '10 minute requeue timeout' });
                changed = true;
                console.log(`[AUTO-TERMINATE] Expired ticket ${ticket.label} removed from ${dept} waiting queue.`);
            }
        }
    }

    if (changed) {
        await saveCurrentState();
        io.emit('queue_update', { currentServing: queueStore.currentServing, waitingQueue: queueStore.waiting });
    }
}

setInterval(processExpiredRequeuedTickets, 30000); // Cleanup pending expired requeue tickets every 30 seconds

// --- 4. DATABASE CONNECTION ---
async function connectDB() {
    try {
        await client.connect();
        db = client.db('psa_queue_system');
        const saved = await db.collection('system_state').findOne({ id: 'active_queue' }); 
        if (saved) {
            queueStore = saved.queueStore;
            ticketSequences = saved.ticketSequences || { national: 1, civil: 1 };
            console.log("🔄 Persistent State Recovered");
        }
        console.log("✅ Connected to MongoDB Atlas: Archive & History Ready");
    } catch (e) { console.error("❌ DB Failed:", e.message); process.exit(1); }
}
connectDB();

app.use(express.json());

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// --- SECURE ROUTING FOR STATISTICS DASHBOARD ---
app.get('/stats_Dashboard.html', async (req, res) => {
    // Explicitly serves the dashboard from your public file root
    res.sendFile(path.join(__dirname, 'public', 'stats_Dashboard.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// --- 5. API ROUTES ---
app.post('/api/get-role', async (req, res) => {
    const user = await db.collection('roles').findOne({ email: req.body.email });
    res.json({ success: true, role: user ? user.role : 'controller' });
});

app.post('/api/set-role', async (req, res) => {
    await db.collection('roles').updateOne({ email: req.body.email }, { $set: { ...req.body, updatedAt: new Date() } }, { upsert: true });
    res.json({ success: true });
});

app.post('/api/request-admin-otp', (req, res) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    adminOTPs[req.body.email] = otp;
    console.log(`\n🔑 ADMIN OTP for ${req.body.email}: ${otp}\n`);
    res.json({ success: true });
});

app.post('/api/verify-admin-otp', (req, res) => {
    const { email, otp } = req.body;
    if (adminOTPs[email] === otp) { delete adminOTPs[email]; res.json({ success: true }); }
    else { res.json({ success: false, error: "Invalid OTP." }); }
});

app.get('/api/system-logs/:folder', async (req, res) => {
    try {
        const logs = await db.collection(req.params.folder).find({}).sort({ iso_timestamp: -1 }).toArray();
        res.json({ success: true, logs });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Add this route right next to your app.get('/api/system-logs/:folder') endpoint
app.get('/api/system-logs/roles', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, error: "Database offline" });
        
        // Pull all assigned system privileges
        const roles = await db.collection('roles').find({}).toArray();
        res.json({ success: true, roles });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/system-logs/:folder/:id', async (req, res) => {
    try {
        await db.collection(req.params.folder).deleteOne({ _id: new ObjectId(req.params.id) });
        io.emit('ticket_logs_updated');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/ticket-statistics', async (req, res) => {
    try {
        if (!db) return res.json({ success: false, error: "Database not connected" });
        
        // Fetch all issued logs from active database collection
        const logs = await db.collection('ticket_logs').find({ action: 'ISSUED' }).toArray();
        
        const now = new Date();
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const weekData = [];

        // Build 6 past tracking intervals ending exactly on today's date
        for (let i = 5; i >= 0; i--) {
            const weekEnd = new Date(now.getTime() - (i * weekMs));
            const weekStart = new Date(weekEnd.getTime() - weekMs);
            
            weekData.push({
                start: weekStart,
                end: weekEnd,
                label: `${weekStart.toLocaleDateString(undefined, {month:'short', day:'numeric'})} - ${weekEnd.toLocaleDateString(undefined, {month:'short', day:'numeric'})}`,
                national: 0,
                civil: 0
            });
        }

        // Distribute transaction counts cleanly into their respective date buckets
        logs.forEach(log => {
            const logTime = new Date(log.iso_timestamp).getTime();
            
            const bucket = weekData.find(w => logTime >= w.start.getTime() && logTime <= w.end.getTime());
            if (bucket) {
                if (log.department === 'national') bucket.national++;
                else if (log.department === 'civil') bucket.civil++;
            }
        });

        // Map data arrays back cleanly to response metrics
        const labels = weekData.map(w => w.label);
        const national = weekData.map(w => w.national);
        const civil = weekData.map(w => w.civil);

        res.json({ 
            success: true, 
            weekLabels: labels, 
            national, 
            civil 
        });
    } catch (err) { 
        res.status(500).json({ success: false, error: err.message }); 
    }
});

app.get('/api/daily-transactions', async (req, res) => {
    try {
        if (!db) return res.json({ success: false, error: "Database not connected" });
        const logs = await db.collection('ticket_logs').find({ action: 'ISSUED' }).toArray();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();
        
        let total = 0, national = 0, civil = 0;
        
        logs.forEach(log => {
            const logDate = new Date(log.iso_timestamp);
            logDate.setHours(0, 0, 0, 0);
            if (logDate.getTime() === todayTime) {
                total++;
                if (log.department === 'national') national++;
                else if (log.department === 'civil') civil++;
            }
        });
        
        res.json({ success: true, total, national, civil });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/national-id-ticket-categories', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ success: false, error: "Database not connected" });
        }

        // Find all 'ISSUED' tickets for the 'national' department
        const nationalIdTickets = await db.collection('ticket_logs').find({
            department: 'national',
            action: 'ISSUED' // We count tickets that have been issued
        }).toArray();

        let regularCount = 0;
        let priorityCount = 0;

        // Iterate through the tickets to count regular and priority
        nationalIdTickets.forEach(ticket => {
            if (ticket.isPriority === true || ticket.isPriority === 'true') {
                priorityCount++;
            } else {
                regularCount++;
            }
        });

        res.json({ success: true, regular: regularCount, priority: priorityCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/civil-registration-ticket-categories', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, error: "Database not connected" });
        const tickets = await db.collection('ticket_logs').find({ department: 'civil', action: 'ISSUED' }).toArray();
        let regular = 0; let priority = 0;
        tickets.forEach(t => { 
            if (t.isPriority === true || t.isPriority === 'true') priority++; 
            else regular++; 
        });
        res.json({ success: true, regular, priority });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/civil-registration-ticket-status-summary', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, error: "Database not connected" });
        const summary = await db.collection('ticket_logs').aggregate([
            { $match: { department: 'civil', action: { $in: ['COMPLETED', 'TERMINATED', 'REQUEUED'] } } },
            { $group: { _id: "$action", count: { $sum: 1 } } }
        ]).toArray();
        let completed = 0, terminated = 0, requeued = 0;
        summary.forEach(item => {
            if (item._id === 'COMPLETED') completed = item.count;
            else if (item._id === 'TERMINATED') terminated = item.count;
            else if (item._id === 'REQUEUED') requeued = item.count;
        });
        res.json({ success: true, completed, terminated, requeued });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/national-id-ticket-status-summary', async (req, res) => {
    try {
        if (!db) return res.status(500).json({ success: false, error: "Database not connected" });
        const summary = await db.collection('ticket_logs').aggregate([
            { $match: { department: 'national', action: { $in: ['COMPLETED', 'TERMINATED', 'REQUEUED'] } } },
            { $group: { _id: "$action", count: { $sum: 1 } } }
        ]).toArray();
        let completed = 0, terminated = 0, requeued = 0;
        summary.forEach(item => {
            if (item._id === 'COMPLETED') completed = item.count;
            else if (item._id === 'TERMINATED') terminated = item.count;
            else if (item._id === 'REQUEUED') requeued = item.count;
        });
        res.json({ success: true, completed, terminated, requeued });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- 6. SOCKET.IO ---
io.on('connection', (socket) => {
    const syncState = () => io.emit('queue_update', { currentServing: queueStore.currentServing, waitingQueue: queueStore.waiting });
    
    // Unified Reset Function: Archives active logs to history before clearing
    const performSystemReset = async () => {
        try {
            console.log("📦 Archiving active logs to master_history...");
            const logs = await db.collection('ticket_logs').find({}).toArray();
            
            if (logs.length > 0) {
                const archivedLogs = logs.map(l => ({ ...l, archivedAt: new Date() }));
                await db.collection('master_history').insertMany(archivedLogs);
                console.log(`✅ ${logs.length} entries moved to master_history.`);
            }

            // Clear the active log collection
            await db.collection('ticket_logs').deleteMany({});

            // Reset sequences and memory
            ticketSequences = { national: 1, civil: 1 };
            queueStore.waiting = { national: [], civil: [] };
            queueStore.currentServing = {
                national: { window1: null, window2: null, priorityWindow: null },
                civil: { window1: null, window2: null, priorityWindow: null }
            };

            await saveCurrentState();
            syncState();
            io.emit('ticket_logs_updated');
            socket.emit('reset_queues_success'); // Alerts Admin Dashboard
            console.log("🧹 System Refresh Complete: Active logs archived.");
        } catch (err) { console.error("Reset Failed:", err); }
    };

    // Listen for BOTH variations of the reset signal from your dashboard
    socket.on('reset_system', performSystemReset);
    socket.on('reset_queues', performSystemReset);

    // Send current queue state when controller requests it
    socket.on('request_queue_update', async () => {
        await processExpiredRequeuedTickets();
        socket.emit('queue_update', {
            currentServing: queueStore.currentServing,
            waitingQueue: queueStore.waiting
        });
    });

    socket.on('issue_ticket', async (data) => {
        const { dept, isPriority } = data;
        const ticketNo = ticketSequences[dept]++;
        const label = `${dept === 'civil' ? 'CR' : 'NID'}-${isPriority ? 'P' : 'R'}-${String(ticketNo).padStart(3, '0')}`;
        const ticket = {
            id: `${dept}-${Date.now()}`,
            label,
            department: dept,
            category: isPriority ? 'Priority' : 'Regular',
            isPriority: Boolean(isPriority),
            status: 'WAITING'
        };
        queueStore.waiting[dept].push(ticket);
        await logEvent('ticket_logs', { ...ticket, action: 'ISSUED' });
        await saveCurrentState();
        socket.emit('ticket_assigned', ticket);
        syncState();
    });

    socket.on('assign_ticket', async (data) => {
        const { dept, window, ticketId } = data;
        const index = queueStore.waiting[dept].findIndex(t => t.id === ticketId);
        if (index !== -1 && !queueStore.currentServing[dept][window]) {
            const ticket = queueStore.waiting[dept].splice(index, 1)[0];
            cancelRequeueTimer(ticket.label);
            delete ticket.requeueTime;
            ticket.status = 'SERVING';
            ticket.window = window;
            queueStore.currentServing[dept][window] = ticket;
            await logEvent('ticket_logs', { ...ticket, action: 'ASSIGNED', window });
            await saveCurrentState();
            syncState();
        }
    });

    socket.on('complete_ticket', async (data) => {
        const { dept, window } = data;
        const ticket = queueStore.currentServing[dept][window];
        if (ticket) {
            cancelRequeueTimer(ticket.label);
            await logEvent('ticket_logs', { label: ticket.label, department: ticket.department, window, action: 'COMPLETED' });
            queueStore.currentServing[dept][window] = null;
            await saveCurrentState();
            syncState();
        }
    });

    socket.on('terminate_ticket', async (data) => {
        const { dept, window } = data;
        const ticket = queueStore.currentServing[dept][window];
        if (ticket) {
            cancelRequeueTimer(ticket.label);
            await logEvent('ticket_logs', { label: ticket.label, department: ticket.department, window, action: 'TERMINATED' });
            queueStore.currentServing[dept][window] = null;
            await saveCurrentState();
            syncState();
        }
    });

    socket.on('requeue_ticket', async (data) => {
        const { dept, window } = data;
        const ticket = queueStore.currentServing[dept][window];
        if (ticket) {
            ticket.status = 'WAITING';
            delete ticket.window;
            ticket.requeueTime = new Date().getTime();
            queueStore.waiting[dept].push(ticket);
            await logEvent('ticket_logs', { label: ticket.label, department: ticket.department, window, action: 'REQUEUED' });
            queueStore.currentServing[dept][window] = null;
            await saveCurrentState();
            syncState();

            // Set 10-minute auto-terminate timer for requeued ticket
            const ticketLabel = ticket.label;
            if (requeueTimers[ticketLabel]) clearTimeout(requeueTimers[ticketLabel]);
            requeueTimers[ticketLabel] = setTimeout(async () => {
                // Find and remove the requeued ticket from waiting queue
                const deptQueues = queueStore.waiting[dept];
                const index = deptQueues.findIndex(t => t.label === ticketLabel);
                if (index !== -1) {
                    const autoTerminatedTicket = deptQueues.splice(index, 1)[0];
                    await logEvent('ticket_logs', { label: ticketLabel, department: dept, action: 'AUTO_TERMINATED_AFTER_REQUEUE', reason: '10 minute requeue timeout' });
                    await saveCurrentState();
                    syncState();
                    console.log(`[AUTO-TERMINATE] Ticket ${ticketLabel} auto-terminated after 10 min requeue timeout`);
                }
                delete requeueTimers[ticketLabel];
            }, 600000); // 10 minutes in milliseconds
        }
    });

    socket.on('register_active_user', async (data) => {
        activeUsers[socket.id] = { email: data.email, role: data.role, location: data.location, lastSeen: new Date() };
        await logEvent('auth_logs', { email: data.email, action: 'LOGIN', location: data.location });
        broadcastActiveUsers();
    });

    socket.on('update_user_location', (location) => {
        if (activeUsers[socket.id]) {
            activeUsers[socket.id].location = location;
            activeUsers[socket.id].lastSeen = new Date();
            broadcastActiveUsers();
        }
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
        broadcastActiveUsers();
    });

    const broadcastActiveUsers = () => {
        const unique = Array.from(new Map(Object.values(activeUsers).map(u => [u.email, u])).values());
        io.emit('active_users_list', unique);
    };
});

const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    const networkInterfaces = os.networkInterfaces();
    const localIp = Object.values(networkInterfaces)
        .flat()
        .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
        .map((iface) => iface.address)[0] || 'localhost';

    console.log(`🚀 PSA Unified System Online: http://${localIp}:${PORT}/login.html`);
    console.log(`Kiosk: http://${localIp}:${PORT}/getTicketNumberV2.html`)
    console.log(`Public Display: http://${localIp}:${PORT}/queue_Status.html`);
});