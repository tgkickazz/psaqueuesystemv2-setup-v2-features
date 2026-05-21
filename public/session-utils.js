import { signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

export function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function getStoredSessionId() {
    return localStorage.getItem('psa_session_id') || '';
}

export function createNewSessionId() {
    const sessionId = crypto.randomUUID();
    localStorage.setItem('psa_session_id', sessionId);
    return sessionId;
}

export async function claimSession(email) {
    const sessionId = createNewSessionId();
    const response = await fetch('/api/claim-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizeEmail(email), sessionId })
    });
    if (!response.ok) throw new Error('Could not claim session');
    const data = await response.json();
    return { sessionId, ...data };
}

export async function releaseSession(email) {
    const sessionId = getStoredSessionId();
    if (!sessionId) return;
    try {
        await fetch('/api/release-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizeEmail(email), sessionId })
        });
    } catch (err) {
        console.warn('release-session failed:', err);
    }
}

export async function checkHasActiveSession(email) {
    try {
        const response = await fetch('/api/session-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizeEmail(email) })
        });
        if (!response.ok) return false;
        const data = await response.json();
        return !!data.hasActiveSession;
    } catch {
        return false;
    }
}

export function handleForcedLogout(auth, kickedEmail, message) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const current = normalizeEmail(currentUser.email);
    const kicked = normalizeEmail(kickedEmail);
    if (current !== kicked) return;

    alert(message || 'You signed in on another device. This session will end now.');
    signOut(auth).then(() => {
        localStorage.removeItem('psa_admin_token');
        localStorage.removeItem('psa_role');
        localStorage.removeItem('psa_session_id');
        localStorage.removeItem('psa_active_location');
        window.location.href = '/login.html';
    });
}

let sessionGuardStarted = false;

export function startSessionGuard(auth, socket) {
    const sessionId = getStoredSessionId();
    if (!sessionId || sessionGuardStarted) return;
    sessionGuardStarted = true;

    const verify = async () => {
        const user = auth.currentUser;
        if (!user) return;
        try {
            const response = await fetch('/api/check-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: normalizeEmail(user.email),
                    sessionId
                })
            });
            if (!response.ok) return;
            const data = await response.json();
            if (!data.valid) {
                handleForcedLogout(
                    auth,
                    user.email,
                    'Your account was signed in on another device. This session will end now.'
                );
            }
        } catch (err) {
            console.warn('Session check failed:', err);
        }
    };

    if (socket) {
        socket.on('force_logout_signal', (kickedEmail) => {
            handleForcedLogout(
                auth,
                kickedEmail,
                'You signed in on another device. This session will end now.'
            );
        });
    }

    verify();
    setInterval(verify, 15000);
}
