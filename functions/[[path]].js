/**
 * 🚀 CLOUDFLARE PAGES SERVERLESS ROUTER ENGINE (functions/[[path]].js)
 * Architecture: Cloudflare Pages Functions + D1 Database + Secure AI API Proxy
 * Project: MR. Ahmed Abd-ElFatah - Unified Student Workspace Portal
 * 
 * 🗄️ D1 Database Binding: env.DB
 * 🆔 Database ID: 690c177a-0e63-4bcd-ae11-5fb684dd463f
 * 📛 Database Name: ahmedabdelfatah-db
 *
 * ⚠️ ONE-TIME SETUP for the Tutoring Center (Roots) feature below:
 * Run 0008_add_tutoring_table.sql once against your D1 database before
 * using it, e.g.:
 *   wrangler d1 execute ahmedabdelfatah-db --file=./0008_add_tutoring_table.sql --remote
 * (use whatever database name wrangler.toml has under [[d1_databases]] ->
 * database_name — until that migration runs, the /api/db/tutoring routes
 * below will just silently return "no sessions" everywhere.)
 */

export async function onRequest(context) {
  try {
    return await handleRequest(context);
  } catch (err) {
    // Last-resort safety net: ANY unexpected throw anywhere below (a bad
    // D1 bind, a malformed body that slipped past a route's own try/catch,
    // etc.) used to bubble up as Cloudflare's raw HTML/plain-text error
    // page. The frontend's d1Request() then failed to parse that as JSON,
    // treated it as "server unreachable", and showed a generic
    // "may not have reached the server" warning even though the request
    // DID reach the server and WAS processed — just not cleanly. Catching
    // here guarantees every response is real JSON the frontend can read.
    return new Response(JSON.stringify({ error: err && err.message ? err.message : 'Unexpected server error.' }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  }
}

async function handleRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 🔒 1. SECURITY & CORS HEADERS
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    const jsonResponse = (data, status = 200) => {
        return new Response(JSON.stringify(data), {
            status,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }

    // 🤖 2. SECURE AI PROXY ENDPOINT (/api/ai/chat)
    // Runs server-side only — the browser never sees any of the 4 secret
    // keys below, it just calls this same-origin endpoint. Set the real
    // keys with (dashboard or CLI, all 4 as Secret/encrypted values):
    //   wrangler pages secret put GROQ_API_KEY
    //   wrangler pages secret put GROQ_API_KEY_2
    //   wrangler pages secret put GROQ_API_KEY_3
    //   wrangler pages secret put GROQ_API_KEY_4
    //
    // Speed fix: the old version tried up to 5 different MODELS one after
    // another on a single key (Cerebras x2, then Groq x3) — every failed
    // attempt was a full round trip the student sat through before the
    // next one even started, which is where the multi-second delay came
    // from. This version calls exactly ONE fast model per attempt and
    // rotates across the 4 KEYS instead: the instant a key is missing,
    // rate-limited (429) or out of quota (402), it moves straight to the
    // next key with no retry-on-the-same-key delay. A 12s timeout per key
    // stops a single hung attempt from stalling the whole request.
    //
    // Never leaks which provider/model answers the request: on failure we
    // only ever return our own generic message, never the raw upstream
    // error body (which could otherwise mention the provider by name).
    if (pathname === '/api/ai/chat' && request.method === 'POST') {
        try {
            const body = await request.json();
            const messages = Array.isArray(body.messages) ? body.messages : null;
            if (!messages) return jsonResponse({ error: 'A "messages" array is required.' }, 400);
            const temperature = typeof body.temperature === 'number' ? body.temperature : 0.7;
            const max_tokens = typeof body.max_tokens === 'number' ? body.max_tokens : 800;

            // All 4 keys are Groq's free tier — kept as separate secrets so
            // if one hits its daily/per-minute free-tier limit, the next
            // one picks up the request instead of the student seeing an error.
            const groqKeys = [
                env.GROQ_API_KEY,
                env.GROQ_API_KEY_2,
                env.GROQ_API_KEY_3,
                env.GROQ_API_KEY_4
            ].filter(Boolean);

            if (groqKeys.length === 0) {
                return jsonResponse({ error: 'AI service is not configured.' }, 503);
            }

            // Groq decommissioned llama-3.1-8b-instant for free/developer-tier
            // accounts on 2026-08-16 — that's why every one of the 4 keys was
            // failing identically ("model not found" from Groq, on every key,
            // every time), not a problem with the keys themselves.
            // openai/gpt-oss-20b is Groq's current recommended fast
            // replacement for it.
            const MODEL = 'openai/gpt-oss-20b';
            let lastStatus = 503;

            for (const key of groqKeys) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 12000);
                try {
                    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${key}`
                        },
                        body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens }),
                        signal: controller.signal
                    });
                    clearTimeout(timer);
                    if (res.ok) {
                        const data = await res.json().catch(() => ({}));
                        return jsonResponse(data, 200);
                    }
                    lastStatus = res.status;
                    // 401/429/402 = bad/rate-limited/out-of-quota key — skip to
                    // the next one immediately without reading the body.
                    continue;
                } catch (err) {
                    clearTimeout(timer);
                    lastStatus = 503;
                    continue;
                }
            }

            return jsonResponse({ error: 'AI service is temporarily unavailable. Please try again in a moment.' }, lastStatus || 503);
        } catch (err) {
            return jsonResponse({ error: 'AI service is temporarily unavailable. Please try again in a moment.' }, 500);
        }
    }

    // ⚡ WARM-UP PING (/api/ping)
    // The login page calls this once on load, while the student is still typing their
    // details. It wakes this Function and opens the D1 connection, so the real login query
    // that follows doesn't pay for a cold start. Returns nothing and never fails loudly.
    if (pathname === '/api/ping') {
        try { if (env.DB) await env.DB.prepare('SELECT 1').first(); } catch (err) { /* warm-up only */ }
        return new Response(null, { status: 204, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
    }

    // 🔐 3. LOGIN ENDPOINT (/api/auth/login)
    // This route never existed before, which is why login always failed:
    // the frontend's fetch('/api/auth/login') fell through to the static
    // asset handler (context.next()), got back a plain 404 page, and
    // handleLogin() treated that as "server answered: invalid credentials"
    // without ever actually checking students_table. Newly-provisioned
    // students (and even the seeded 'admin' row) were always rejected —
    // not because the row was missing, but because nothing ever looked.
    if (pathname === '/api/auth/login' && request.method === 'POST') {
        try {
            const { id, password } = await request.json();
            if (!id || !password) {
                return jsonResponse({ error: 'Missing credentials.' }, 400);
            }

            const d1 = env.DB;
            if (!d1) {
                // No D1 binding reachable (e.g. local static preview) — tell the
                // frontend to fall back to its local/offline check instead of
                // pretending this was a definitive "invalid credentials" answer.
                return jsonResponse({ error: 'Database not configured.' }, 503);
            }

            // "phone" is the login ID students type in (see schema.sql comment).
            // The seeded admin row also has phone = 'admin', so this one query
            // covers both student and teacher/admin logins.
            const row = await d1.prepare('SELECT * FROM students_table WHERE phone = ?')
                .bind(String(id).trim())
                .first();

            if (!row || String(row.password) !== String(password)) {
                return jsonResponse({ error: 'Invalid credentials.' }, 401);
            }

            // Never send the password hash/plaintext back to the client.
            const { password: _pw, ...safeUser } = row;
            return jsonResponse({ user: safeUser });
        } catch (err) {
            return jsonResponse({ error: err.message }, 400);
        }
    }

        // 🗄️ 3. CLOUDFLARE D1 DATABASE API ENDPOINTS (/api/db/*)
    // Matches exact table names in D1: students_table, videos_table, materials_table, feed_table, portal_feedbacks
    if (pathname.startsWith('/api/db/')) {
        const d1 = env.DB;

        // ---- Video Privileges helpers (unlock codes) ----
        // Looks a student up by login ID (phone) or numeric row id, like the
        // other routes do. Returns null if there is no such account.
        const resolveStudent = async (key) => {
            if (!d1 || key === undefined || key === null || String(key).trim() === '') return null;
            return await d1.prepare('SELECT id, phone, name, role FROM students_table WHERE phone = ? OR id = ?')
                .bind(String(key).trim(), String(key).trim()).first();
        };
        const isStaff = (row) => !!row && ['teacher', 'admin'].includes(String(row.role || '').toLowerCase());
        // 8 chars from a 32-letter alphabet with no 0/O/1/I look-alikes.
        // 256 is divisible by 32, so `byte % 32` has no modulo bias.
        const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const generateAccessCode = () => {
            const bytes = new Uint8Array(8);
            crypto.getRandomValues(bytes);
            let s = '';
            for (const b of bytes) s += CODE_ALPHABET[b % 32];
            return s.slice(0, 4) + '-' + s.slice(4);
        };
        const normalizeAccessCode = (raw) => {
            const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : s;
        };

        // --- STUDENTS TABLE ENDPOINTS ---
        if (pathname === '/api/db/students') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM students_table ORDER BY xp DESC, watch_mins DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const student = await request.json();
                    if (d1) {
                        await d1.prepare(`
                            INSERT INTO students_table (phone, name, password, grade, gender, title, xp, watch_mins, role, can_post_feed, completed_lecture_ids)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(phone) DO UPDATE SET
                                name = excluded.name,
                                password = excluded.password,
                                grade = excluded.grade,
                                gender = excluded.gender,
                                title = excluded.title,
                                xp = excluded.xp,
                                watch_mins = excluded.watch_mins,
                                role = excluded.role,
                                can_post_feed = excluded.can_post_feed,
                                completed_lecture_ids = excluded.completed_lecture_ids
                        `).bind(
                            student.phone || student.id,
                            student.name,
                            student.password || '123456',
                            student.grade || 'Grade 10 (Secandory 1)',
                            student.gender || 'Boy',
                            student.title || null,
                            student.xp || 0,
                            student.watch_mins || 0,
                            student.role || 'student',
                            student.can_post_feed ? 1 : 0,
                            JSON.stringify(student.completed_lecture_ids || [])
                        ).run();

                        // ON CONFLICT upserts don't reliably report last_row_id, so look the row up by its unique phone/id
                        const row = await d1.prepare('SELECT id FROM students_table WHERE phone = ?')
                            .bind(student.phone || student.id).first();

                        return jsonResponse({ success: true, id: row ? row.id : null, message: 'Student account provisioned in D1.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        // Narrow progress-only save used after every finished video
        // (see D1.saveProgress / markLectureCompleted in index.html).
        // This route was missing entirely, so every call to it fell through
        // to the catch-all 404 below, D1.saveProgress() resolved to null,
        // and markLectureCompleted() rolled the +150 XP right back and
        // showed "Couldn't save your progress to the cloud" — every single
        // time, on every video. Only touches xp / watch_mins /
        // completed_lecture_ids, never the password, so it's safe to call
        // with the trimmed-down currentUser object the login endpoint returns.
        if (pathname === '/api/db/students/progress' && request.method === 'POST') {
            try {
                const { id, xp, watch_mins, completed_lecture_ids } = await request.json();
                if (!id) return jsonResponse({ error: 'Missing student id.' }, 400);
                if (d1) {
                    await d1.prepare(`
                        UPDATE students_table
                        SET xp = ?, watch_mins = ?, completed_lecture_ids = ?
                        WHERE phone = ? OR id = ?
                    `).bind(
                        Number(xp) || 0,
                        Number(watch_mins) || 0,
                        JSON.stringify(completed_lecture_ids || []),
                        id, id
                    ).run();
                    return jsonResponse({ success: true, message: 'Progress saved.' });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        if (pathname === '/api/db/students/xp' && request.method === 'POST') {
            try {
                const { id, xpAmount } = await request.json();
                if (d1) {
                    await d1.prepare('UPDATE students_table SET xp = MAX(0, xp + ?) WHERE phone = ? OR id = ?')
                        .bind(xpAmount, id, id).run();
                    return jsonResponse({ success: true, message: `Granted ${xpAmount} EXP to student.` });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        if (pathname.startsWith('/api/db/students/') && request.method === 'DELETE') {
            const studentId = pathname.split('/').pop();
            if (d1 && studentId) {
                await d1.prepare('DELETE FROM students_table WHERE phone = ? OR id = ?').bind(studentId, studentId).run();
                return jsonResponse({ success: true, message: 'Student record removed.' });
            }
            return jsonResponse({ success: true });
        }

        // Account tab: change-your-own-password. Verifies the CURRENT password
        // server-side (the client never holds it — /api/auth/login strips it
        // from the response) before writing the new one. Never routes through
        // the general /students upsert, same reasoning as /students/progress.
        if (pathname === '/api/db/students/password' && request.method === 'POST') {
            try {
                const { id, old_password, new_password } = await request.json();
                if (!id || !old_password || !new_password) {
                    return jsonResponse({ error: 'Missing id, old_password or new_password.' }, 400);
                }
                if (String(new_password).length < 4) {
                    return jsonResponse({ error: 'New password must be at least 4 characters.' }, 400);
                }
                if (!d1) return jsonResponse({ success: true, mock: true });

                const row = await d1.prepare('SELECT password FROM students_table WHERE phone = ? OR id = ?')
                    .bind(id, id).first();
                if (!row || String(row.password) !== String(old_password)) {
                    return jsonResponse({ error: 'Current password is incorrect.' }, 401);
                }

                await d1.prepare('UPDATE students_table SET password = ? WHERE phone = ? OR id = ?')
                    .bind(String(new_password), id, id).run();
                return jsonResponse({ success: true, message: 'Password updated.' });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        // Account tab: change-your-own-avatar. Accepts either a preset filename
        // (e.g. "student1.png") or a self-contained data: URI (emoji avatar or
        // an uploaded/resized photo). Kept separate from the general /students
        // upsert for the same password-safety reason as /students/progress.
        if (pathname === '/api/db/students/avatar' && request.method === 'POST') {
            try {
                const { id, avatar } = await request.json();
                if (!id) return jsonResponse({ error: 'Missing student id.' }, 400);
                const avatarStr = String(avatar || '');
                if (avatarStr.length > 400000) {
                    return jsonResponse({ error: 'That image is too large even after resizing — try a simpler photo.' }, 400);
                }
                if (d1) {
                    await d1.prepare('UPDATE students_table SET avatar = ? WHERE phone = ? OR id = ?')
                        .bind(avatarStr, id, id).run();
                    return jsonResponse({ success: true, message: 'Avatar updated.' });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        // --- VIDEOS / LECTURES ENDPOINTS ---
        if (pathname === '/api/db/lectures') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM videos_table ORDER BY id ASC').all();
                    // Videos flagged requires_code only reveal their stream URL to
                    // staff, or to a student who has redeemed a code for that video.
                    // Everyone else gets locked:true and an empty URL, so the link
                    // never reaches the browser (hiding it in the UI alone wouldn't
                    // stop anyone opening DevTools).
                    const viewer = await resolveStudent(url.searchParams.get('user'));
                    const staff = isStaff(viewer);
                    const unlocked = new Set();
                    if (viewer && !staff) {
                        try {
                            const { results: ul } = await d1.prepare('SELECT video_id FROM video_unlocks_table WHERE student_id = ?').bind(viewer.phone).all();
                            (ul || []).forEach(r => unlocked.add(Number(r.video_id)));
                        } catch (e) { /* migration not applied yet: nothing is unlocked */ }
                    }
                    return jsonResponse((results || []).map(v => {
                        const needs = !!v.requires_code;
                        const locked = needs && !staff && !unlocked.has(Number(v.id));
                        return {
                            ...v,
                            requires_code: needs ? 1 : 0,
                            locked,
                            archive_url: locked ? '' : v.archive_url,
                            filename: locked ? '' : v.filename
                        };
                    }));
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const lec = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO videos_table (title, description, lesson, part, grade, filename, archive_url, duration_mins)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            lec.title,
                            lec.description || '',
                            lec.lesson || '1',
                            lec.part || 1,
                            lec.grade || 'Grade 10 (Secondary 1)',
                            lec.filename || lec.archive_url || 'video.mp4',
                            lec.archive_url || lec.filename || '',
                            lec.duration_mins || 45
                        ).run();
                        if (lec.requires_code) {
                            await d1.prepare('UPDATE videos_table SET requires_code = 1 WHERE id = ?').bind(result.meta.last_row_id).run();
                        }
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Lecture registered in D1.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        // Updates only a session's length (in minutes). The site calls this when the real length of a video is
        // read from the player, so a session that was saved with the old default of 45 minutes gets corrected.
        if (pathname.startsWith('/api/db/lectures/') && request.method === 'PUT') {
            try {
                const lecId = pathname.split('/').pop();
                const body = await request.json();
                if (body.requires_code !== undefined) {
                    const admin = await resolveStudent(body.admin_id);
                    if (!isStaff(admin)) return jsonResponse({ error: 'Only the teacher/admin can change this.' }, 403);
                    if (d1) await d1.prepare('UPDATE videos_table SET requires_code = ? WHERE id = ?').bind(body.requires_code ? 1 : 0, lecId).run();
                    return jsonResponse({ success: true, requires_code: body.requires_code ? 1 : 0 });
                }
                const mins = Math.round(Number(body.duration_mins));
                if (!lecId || !Number.isFinite(mins) || mins < 1 || mins > 1440) {
                    return jsonResponse({ error: 'duration_mins must be a whole number of minutes between 1 and 1440.' }, 400);
                }
                if (d1) {
                    await d1.prepare('UPDATE videos_table SET duration_mins = ? WHERE id = ?').bind(mins, lecId).run();
                }
                return jsonResponse({ success: true, duration_mins: mins });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        if (pathname.startsWith('/api/db/lectures/') && request.method === 'DELETE') {
            const lecId = pathname.split('/').pop();
            if (d1 && lecId) {
                await d1.prepare('DELETE FROM videos_table WHERE id = ?').bind(lecId).run();
                try {
                    await d1.batch([
                        d1.prepare('DELETE FROM video_access_codes_table WHERE video_id = ?').bind(lecId),
                        d1.prepare('DELETE FROM video_unlocks_table WHERE video_id = ?').bind(lecId)
                    ]);
                } catch (e) { /* tables not created yet */ }
                return jsonResponse({ success: true, message: 'Lecture deleted.' });
            }
            return jsonResponse({ success: true });
        }

        // --- VIDEO PRIVILEGES: access codes + permanent unlocks ---
        // Admin Console issues a one-time code for ONE student + ONE video. The
        // student redeems it once; that writes a row to video_unlocks_table and
        // the video stays unlocked for them forever (until an admin revokes it).

        // Student redeems a code
        if (pathname === '/api/db/video-codes/redeem' && request.method === 'POST') {
            try {
                const { student_id, code } = await request.json();
                const student = await resolveStudent(student_id);
                const normalized = normalizeAccessCode(code);
                // One generic message for "no such code" and "someone else's code"
                // so this endpoint can't be used to probe which codes exist.
                const invalid = () => jsonResponse({ error: 'That code is not valid for your account.' }, 403);
                if (!student || !normalized) return invalid();
                const row = await d1.prepare('SELECT * FROM video_access_codes_table WHERE code = ?').bind(normalized).first();
                if (!row || String(row.student_id) !== String(student.phone)) return invalid();

                if (!row.redeemed_at) {
                    await d1.batch([
                        d1.prepare('INSERT OR IGNORE INTO video_unlocks_table (student_id, video_id) VALUES (?, ?)').bind(student.phone, row.video_id),
                        d1.prepare("UPDATE video_access_codes_table SET redeemed_at = datetime('now') WHERE id = ?").bind(row.id)
                    ]);
                }
                const video = await d1.prepare('SELECT id, title, archive_url FROM videos_table WHERE id = ?').bind(row.video_id).first();
                if (!video) return jsonResponse({ error: 'That video no longer exists.' }, 404);
                return jsonResponse({
                    success: true,
                    already: !!row.redeemed_at,
                    video_id: video.id,
                    title: video.title,
                    archive_url: video.archive_url
                });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        // Admin: list codes / generate a code
        if (pathname === '/api/db/video-codes') {
            if (request.method === 'GET') {
                const admin = await resolveStudent(url.searchParams.get('admin_id'));
                if (!isStaff(admin)) return jsonResponse({ error: 'Only the teacher/admin can view codes.' }, 403);
                if (!d1) return jsonResponse([]);
                const { results } = await d1.prepare(`
                    SELECT c.id, c.code, c.student_id, c.video_id, c.created_at, c.redeemed_at,
                           s.name AS student_name, v.title AS video_title
                    FROM video_access_codes_table c
                    LEFT JOIN students_table s ON s.phone = c.student_id
                    LEFT JOIN videos_table v ON v.id = c.video_id
                    ORDER BY c.id DESC LIMIT 200
                `).all();
                return jsonResponse(results || []);
            }

            if (request.method === 'POST') {
                try {
                    const { admin_id, student_id, video_id } = await request.json();
                    const admin = await resolveStudent(admin_id);
                    if (!isStaff(admin)) return jsonResponse({ error: 'Only the teacher/admin can generate codes.' }, 403);
                    if (!d1) return jsonResponse({ error: 'Database not configured.' }, 503);

                    const student = await resolveStudent(student_id);
                    if (!student) return jsonResponse({ error: 'Student not found.' }, 404);
                    const video = await d1.prepare('SELECT id, requires_code FROM videos_table WHERE id = ?').bind(video_id).first();
                    if (!video) return jsonResponse({ error: 'Video not found.' }, 404);
                    if (!video.requires_code) return jsonResponse({ error: 'That video is open to everyone. Turn on "Code required" for it first.' }, 400);

                    const already = await d1.prepare('SELECT id FROM video_unlocks_table WHERE student_id = ? AND video_id = ?').bind(student.phone, video.id).first();
                    if (already) return jsonResponse({ error: `${student.name} already has this video unlocked.` }, 409);

                    // Re-use the pending code for this pair instead of piling up duplicates.
                    const pending = await d1.prepare('SELECT id, code FROM video_access_codes_table WHERE student_id = ? AND video_id = ? AND redeemed_at IS NULL')
                        .bind(student.phone, video.id).first();
                    if (pending) return jsonResponse({ success: true, id: pending.id, code: pending.code, reused: true, student_name: student.name });

                    for (let attempt = 0; attempt < 5; attempt++) {
                        const code = generateAccessCode();
                        try {
                            const r = await d1.prepare('INSERT INTO video_access_codes_table (code, student_id, video_id, created_by) VALUES (?, ?, ?, ?)')
                                .bind(code, student.phone, video.id, admin.phone).run();
                            return jsonResponse({ success: true, id: r.meta.last_row_id, code, reused: false, student_name: student.name });
                        } catch (e) {
                            if (!/UNIQUE/i.test(String(e && e.message))) throw e; // only retry code collisions
                        }
                    }
                    return jsonResponse({ error: 'Could not generate a unique code. Try again.' }, 500);
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        // Admin: revoke a code. If it was already redeemed this also re-locks the video for that student.
        if (pathname.startsWith('/api/db/video-codes/') && request.method === 'DELETE') {
            const admin = await resolveStudent(url.searchParams.get('admin_id'));
            if (!isStaff(admin)) return jsonResponse({ error: 'Only the teacher/admin can revoke codes.' }, 403);
            const codeId = pathname.split('/').pop();
            if (d1 && codeId) {
                const row = await d1.prepare('SELECT * FROM video_access_codes_table WHERE id = ?').bind(codeId).first();
                if (row) {
                    await d1.batch([
                        d1.prepare('DELETE FROM video_unlocks_table WHERE student_id = ? AND video_id = ?').bind(row.student_id, row.video_id),
                        d1.prepare('DELETE FROM video_access_codes_table WHERE id = ?').bind(codeId)
                    ]);
                }
            }
            return jsonResponse({ success: true, message: 'Code revoked.' });
        }

        // --- MATERIALS ENDPOINTS ---
        if (pathname === '/api/db/materials') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM materials_table ORDER BY id DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const mat = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO materials_table (title, type, grade, desc, filename)
                            VALUES (?, ?, ?, ?, ?)
                        `).bind(
                            mat.title,
                            mat.type || 'Worksheet',
                            mat.grade || 'Grade 10 (Secondary 1)',
                            mat.desc || mat.type || '',
                            mat.file_url || mat.filename || 'sheet.pdf'
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Study material uploaded.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/materials/') && request.method === 'DELETE') {
            const matId = pathname.split('/').pop();
            if (d1 && matId) {
                await d1.prepare('DELETE FROM materials_table WHERE id = ?').bind(matId).run();
                return jsonResponse({ success: true, message: 'Material deleted.' });
            }
            return jsonResponse({ success: true });
        }

        // --- COMMUNITY FEED ENDPOINTS ---
        if (pathname === '/api/db/feed') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM feed_table ORDER BY id DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const post = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO feed_table (author, date, text, attachment_name, image, comments_json, likes_json, xp, level_title, author_role, author_gender, author_title, font_size, text_color, attachment_type, attachment_url)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            post.author,
                            post.date || 'Today',
                            post.text,
                            post.attachment_name ?? post.attachmentName ?? null,
                            post.image ?? (post.attachment_type === 'image' || post.attachmentType === 'image' ? 'uploaded.jpg' : null),
                            post.comments_json ?? JSON.stringify(post.comments || []),
                            post.likes_json ?? JSON.stringify(post.likedBy || []),
                            post.xp || 0,
                            post.level_title ?? post.levelTitle ?? 'Novice Scientist 🟢',
                            post.author_role ?? post.role ?? 'Student',
                            post.author_gender ?? post.gender ?? 'Boy',
                            post.author_title ?? post.title ?? null,
                            post.font_size ?? post.fontSize ?? '13px',
                            post.text_color ?? post.textColor ?? null,
                            post.attachment_type ?? post.attachmentType ?? null,
                            post.attachment_url ?? post.attachmentUrl ?? null
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Feed post broadcasted.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        // Comments, likes, author title/avatar choice and text styling are kept
        // together in the post payload. Saving the whole record prevents a reload
        // from turning a developer profile into the default student profile.
        if (pathname.startsWith('/api/db/feed/') && request.method === 'PUT') {
            try {
                const feedId = pathname.split('/').pop();
                const post = await request.json();
                if (d1 && feedId) {
                    await d1.prepare(`
                        UPDATE feed_table SET date=?, text=?, attachment_name=?, comments_json=?, likes_json=?,
                        author_role=?, author_gender=?, author_title=?, font_size=?, text_color=?, attachment_type=?, attachment_url=?
                        WHERE id=?
                    `).bind(
                        post.date || 'Today', post.text, post.attachment_name ?? post.attachmentName ?? null,
                        post.comments_json ?? JSON.stringify(post.comments || []), post.likes_json ?? JSON.stringify(post.likedBy || []),
                        post.author_role ?? post.role ?? 'Student', post.author_gender ?? post.gender ?? 'Boy', post.author_title ?? post.title ?? null,
                        post.font_size ?? post.fontSize ?? '13px', post.text_color ?? post.textColor ?? null,
                        post.attachment_type ?? post.attachmentType ?? null, post.attachment_url ?? post.attachmentUrl ?? null, feedId
                    ).run();
                    return jsonResponse({ success: true });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        if (pathname.startsWith('/api/db/feed/') && request.method === 'DELETE') {
            const feedId = pathname.split('/').pop();
            if (d1 && feedId) {
                await d1.prepare('DELETE FROM feed_table WHERE id = ?').bind(feedId).run();
                return jsonResponse({ success: true, message: 'Feed post deleted.' });
            }
            return jsonResponse({ success: true });
        }

        // --- PORTAL FEEDBACKS ENDPOINTS ---
        if (pathname === '/api/db/feedbacks') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM portal_feedbacks ORDER BY id DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const fb = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO portal_feedbacks (author, gender, id_val, rating, text, date)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).bind(
                            fb.author,
                            fb.gender || 'Boy',
                            fb.idVal || 'guest',
                            fb.rating || 0,
                            fb.text,
                            fb.date || 'Today'
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Feedback review submitted.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        // Editing a review only ever changes its rating, text and date —
        // the author, gender and id_val stay put so the review still
        // belongs to whoever originally posted it.
        if (pathname.startsWith('/api/db/feedbacks/') && request.method === 'PUT') {
            try {
                const fbId = pathname.split('/').pop();
                const fb = await request.json();
                if (d1 && fbId) {
                    await d1.prepare(`
                        UPDATE portal_feedbacks SET rating=?, text=?, date=?
                        WHERE id=?
                    `).bind(
                        fb.rating || 0,
                        fb.text,
                        fb.date || 'Today',
                        fbId
                    ).run();
                    return jsonResponse({ success: true, message: 'Feedback updated.' });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        if (pathname.startsWith('/api/db/feedbacks/') && request.method === 'DELETE') {
            const fbId = pathname.split('/').pop();
            if (d1 && fbId) {
                await d1.prepare('DELETE FROM portal_feedbacks WHERE id = ?').bind(fbId).run();
                return jsonResponse({ success: true, message: 'Feedback removed.' });
            }
            return jsonResponse({ success: true });
        }

        // --- TUTORING CENTER (ROOTS) ENDPOINTS ---
        // Requires a one-time table creation in the D1 console (see README note at the
        // bottom of this file) — everything below just talks to that table.
        if (pathname === '/api/db/tutoring') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM tutoring_table ORDER BY session_date ASC, session_time ASC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const s = await request.json();
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO tutoring_table (title, session_date, session_time, location, notes, grade, recurring, active)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            s.title,
                            s.session_date || s.date,
                            s.session_time || s.time,
                            s.location || '',
                            s.notes || '',
                            s.grade || 'All Grades',
                            s.recurring ? 1 : 0,
                            s.active === false ? 0 : 1
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Tutoring session added.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/tutoring/') && request.method === 'PUT') {
            try {
                const tId = pathname.split('/').pop();
                const s = await request.json();
                if (d1 && tId) {
                    await d1.prepare(`
                        UPDATE tutoring_table SET title=?, session_date=?, session_time=?, location=?, notes=?, grade=?, recurring=?, active=?
                        WHERE id=?
                    `).bind(
                        s.title, s.session_date || s.date, s.session_time || s.time,
                        s.location || '', s.notes || '', s.grade || 'All Grades',
                        s.recurring ? 1 : 0, s.active === false ? 0 : 1, tId
                    ).run();
                    return jsonResponse({ success: true, message: 'Tutoring session updated.' });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        if (pathname.startsWith('/api/db/tutoring/') && request.method === 'DELETE') {
            const tId = pathname.split('/').pop();
            if (d1 && tId) {
                await d1.prepare('DELETE FROM tutoring_table WHERE id = ?').bind(tId).run();
                return jsonResponse({ success: true, message: 'Tutoring session deleted.' });
            }
            return jsonResponse({ success: true });
        }

        // --- CHAT ENDPOINTS ---
        // Requires the chat tables from schema.sql (chat_messages_table,
        // chat_grants_table, chat_nicknames_table) to actually exist on your
        // --remote D1 database, plus the `edited` column added in
        // 0011_add_chat_message_edit_flag.sql:
        //   wrangler d1 execute ahmedabdelfatah-db --file=./schema.sql --remote
        //   wrangler d1 execute ahmedabdelfatah-db --file=./0011_add_chat_message_edit_flag.sql --remote
        // (both are safe to run more than once). If messages send fine but
        // never show up for the other person / on another browser, this is
        // almost always why — re-run those two against --remote.
        // Rooms are plain string IDs the frontend builds and owns:
        //   "grade:<Grade Name>" for a grade's group chat, "dm:<idA>|<idB>"
        //   (IDs sorted) for a direct message thread between two granted users.
        if (pathname === '/api/db/chat/messages') {
            if (request.method === 'GET') {
                const room = url.searchParams.get('room');
                if (!room) return jsonResponse({ error: 'Missing room parameter.' }, 400);
                // Wrapped in try/catch (unlike before): if chat_messages_table
                // doesn't exist yet on this D1 database (schema.sql not applied
                // --remote, or applied before the chat tables were added), this
                // query throws. Previously that threw all the way out of the
                // Function as an unhandled 500/HTML error page instead of JSON,
                // so d1Request() on the frontend saw `res.ok === false`, returned
                // null, and the Chat tab just silently showed no messages —
                // including on a second browser that never got a real answer
                // either. Run schema.sql (it's all `CREATE TABLE IF NOT EXISTS`,
                // safe to re-run) against --remote if this keeps happening.
                try {
                    if (d1) {
                        const { results } = await d1.prepare(
                            'SELECT * FROM chat_messages_table WHERE room_id = ? ORDER BY id ASC LIMIT 300'
                        ).bind(room).all();
                        return jsonResponse(results || []);
                    }
                    return jsonResponse([]);
                } catch (err) {
                    return jsonResponse({ error: err.message }, 500);
                }
            }

            if (request.method === 'POST') {
                try {
                    const m = await request.json();
                    if (!m.room_id || !m.sender_id || !String(m.text || '').trim()) {
                        return jsonResponse({ error: 'room_id, sender_id and text are required.' }, 400);
                    }
                    // Attachments (photo / PDF / voice note) travel as data: URIs
                    // already resized/capped client-side. encrypted=1 means
                    // `text` (and attachment_url, if present) are AES-GCM
                    // ciphertext the client will decrypt on read — the server
                    // never sees plaintext for those rooms.
                    //
                    // D1 rejects any single bound parameter over ~2,000,000 bytes.
                    // The old code sliced attachment_url down to 6,000,000 chars,
                    // which is well OVER that ceiling — so any voice note/photo
                    // past ~2MB of base64 made the INSERT throw, D1.sendChatMessage()
                    // came back null, and the frontend showed "may not have reached
                    // the server" even though the real problem was "too big for D1".
                    // Reject clearly instead of truncating (truncating a base64
                    // data: URI corrupts it into something that can't decode anyway).
                    const MAX_ATTACHMENT_B64 = 1800000; // stays safely under D1's ~2MB bound-parameter limit
                    if (m.attachment_url && String(m.attachment_url).length > MAX_ATTACHMENT_B64) {
                        return jsonResponse({ error: 'That attachment is too large to store — try a shorter recording or a smaller image.' }, 413);
                    }
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO chat_messages_table
                                (room_id, sender_id, sender_name, sender_avatar, text, attachment_type, attachment_url, attachment_name, encrypted)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            m.room_id,
                            m.sender_id,
                            m.sender_name || 'Student',
                            m.sender_avatar || '',
                            String(m.text).slice(0, 20000),
                            m.attachment_type || null,
                            m.attachment_url || null,
                            m.attachment_name ? String(m.attachment_name).slice(0, 200) : null,
                            m.encrypted ? 1 : 0
                        ).run();
                        return jsonResponse({ success: true, id: result.meta.last_row_id });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        // Edit your own chat message's text. Voice messages are never
        // editable — enforced here server-side (not just by the frontend
        // hiding the edit button), so a replayed request can't sneak an
        // edit onto a voice note. `edited` is stamped so the bubble can
        // show a small "edited" tag.
        if (pathname.startsWith('/api/db/chat/messages/') && request.method === 'PUT') {
            try {
                const msgId = pathname.split('/').pop();
                const { text, sender_id, encrypted } = await request.json();
                if (!msgId || !sender_id || !String(text || '').trim()) {
                    return jsonResponse({ error: 'text and sender_id are required.' }, 400);
                }
                if (d1) {
                    const row = await d1.prepare('SELECT sender_id, attachment_type FROM chat_messages_table WHERE id = ?')
                        .bind(msgId).first();
                    if (!row) return jsonResponse({ error: 'Message not found.' }, 404);
                    if (String(row.sender_id) !== String(sender_id)) {
                        return jsonResponse({ error: 'You can only edit your own messages.' }, 403);
                    }
                    if (row.attachment_type === 'audio') {
                        return jsonResponse({ error: 'Voice messages cannot be edited.' }, 400);
                    }
                    await d1.prepare('UPDATE chat_messages_table SET text = ?, encrypted = ?, edited = 1 WHERE id = ?')
                        .bind(String(text).slice(0, 20000), encrypted ? 1 : 0, msgId).run();
                    return jsonResponse({ success: true });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        // Delete your own chat message. sender_id travels as a query param
        // (DELETE requests aren't guaranteed a body everywhere) and is
        // checked against the stored row before anything is removed.
        if (pathname.startsWith('/api/db/chat/messages/') && request.method === 'DELETE') {
            try {
                const msgId = pathname.split('/').pop();
                const senderId = url.searchParams.get('sender_id');
                if (!msgId || !senderId) return jsonResponse({ error: 'Missing message id or sender_id.' }, 400);
                if (d1) {
                    const row = await d1.prepare('SELECT sender_id FROM chat_messages_table WHERE id = ?').bind(msgId).first();
                    if (!row) return jsonResponse({ success: true }); // already gone — treat as success
                    if (String(row.sender_id) !== String(senderId)) {
                        return jsonResponse({ error: 'You can only delete your own messages.' }, 403);
                    }
                    await d1.prepare('DELETE FROM chat_messages_table WHERE id = ?').bind(msgId).run();
                    return jsonResponse({ success: true, message: 'Message deleted.' });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        // DM Threads — every direct-message room a given account currently
        // has activity in, newest first. Replaces the old "admin must grant
        // every A<->B pair" model: any account can open a DM with any other
        // account from the Chat tab, and the thread simply appears here for
        // both sides the moment a first message is sent.
        if (pathname === '/api/db/chat/dm-threads') {
            const me = url.searchParams.get('user');
            if (!me) return jsonResponse({ error: 'Missing user parameter.' }, 400);
            if (d1) {
                const { results: idRows } = await d1.prepare(`
                    SELECT room_id, MAX(id) as last_id FROM chat_messages_table
                    WHERE room_id LIKE 'dm:%' AND (room_id LIKE ? OR room_id LIKE ?)
                    GROUP BY room_id
                `).bind(`dm:${me}|%`, `dm:%|${me}`).all();

                if (!idRows || !idRows.length) return jsonResponse([]);
                const ids = idRows.map(r => r.last_id);
                const placeholders = ids.map(() => '?').join(',');
                const { results } = await d1.prepare(
                    `SELECT * FROM chat_messages_table WHERE id IN (${placeholders}) ORDER BY id DESC`
                ).bind(...ids).all();
                return jsonResponse(results || []);
            }
            return jsonResponse([]);
        }

        // Chat Nicknames — a private, per-viewer custom label for a chat
        // room (a DM or a grade group). Never overwrites anyone's real
        // name; it's purely local display text for the person who set it.
        if (pathname === '/api/db/chat/nicknames') {
            const me = url.searchParams.get('user');
            if (!me) return jsonResponse({ error: 'Missing user parameter.' }, 400);
            if (d1) {
                const { results } = await d1.prepare(
                    'SELECT room_id, nickname FROM chat_nicknames_table WHERE user_id = ?'
                ).bind(me).all();
                return jsonResponse(results || []);
            }
            return jsonResponse([]);
        }

        if (pathname === '/api/db/chat/nickname' && request.method === 'POST') {
            try {
                const { user_id, room_id, nickname } = await request.json();
                if (!user_id || !room_id) return jsonResponse({ error: 'user_id and room_id are required.' }, 400);
                if (d1) {
                    const clean = String(nickname || '').trim().slice(0, 60);
                    if (clean) {
                        await d1.prepare(`
                            INSERT INTO chat_nicknames_table (user_id, room_id, nickname) VALUES (?, ?, ?)
                            ON CONFLICT(user_id, room_id) DO UPDATE SET nickname = excluded.nickname
                        `).bind(user_id, room_id, clean).run();
                    } else {
                        // Empty nickname clears the custom label back to the default.
                        await d1.prepare('DELETE FROM chat_nicknames_table WHERE user_id = ? AND room_id = ?')
                            .bind(user_id, room_id).run();
                    }
                    return jsonResponse({ success: true });
                }
                return jsonResponse({ success: true, mock: true });
            } catch (err) {
                return jsonResponse({ error: err.message }, 400);
            }
        }

        // Chat Grants — created from the Admin Console, these are what let two
        // specific accounts open a direct message with each other. Stored with
        // user_a/user_b sorted alphabetically so the UNIQUE constraint catches
        // a duplicate grant regardless of which account was picked first.
        if (pathname === '/api/db/chat/grants') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM chat_grants_table ORDER BY id DESC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const { user_a, user_b } = await request.json();
                    if (!user_a || !user_b || user_a === user_b) {
                        return jsonResponse({ error: 'Two different users are required.' }, 400);
                    }
                    const [a, b] = [String(user_a), String(user_b)].sort();
                    if (d1) {
                        await d1.prepare(`
                            INSERT INTO chat_grants_table (user_a, user_b) VALUES (?, ?)
                            ON CONFLICT(user_a, user_b) DO NOTHING
                        `).bind(a, b).run();
                        const row = await d1.prepare('SELECT id FROM chat_grants_table WHERE user_a = ? AND user_b = ?')
                            .bind(a, b).first();
                        return jsonResponse({ success: true, id: row ? row.id : null, message: 'Chat grant created.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/chat/grants/') && request.method === 'DELETE') {
            const grantId = pathname.split('/').pop();
            if (d1 && grantId) {
                await d1.prepare('DELETE FROM chat_grants_table WHERE id = ?').bind(grantId).run();
                return jsonResponse({ success: true, message: 'Chat grant revoked.' });
            }
            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'D1 endpoint not found.' }, 404);
    }

    // This is a catch-all Pages Function. Let regular site URLs continue to
    // the static asset handler so / serves index.html instead of API JSON.
    return context.next();
}a
