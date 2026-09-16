/**
 * 🚀 CLOUDFLARE PAGES SERVERLESS ROUTER ENGINE (functions/[[path]].js)
 * Architecture: Cloudflare Pages Functions + D1 Database + Secure AI API Proxy
 * Project: MR. Ahmed Abd-ElFatah - Unified Student Workspace Portal
 * 
 * 🗄️ D1 Database Binding: env.DB
 * 🆔 Database ID: 48d0a802-ac09-4084-ba2f-51231553b465
 * 📛 Database Name: ahmed-abdelfatah-db
 */

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;
    const encoder = new TextEncoder();
    const SESSION_COOKIE = 'portal_session';
    const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
    const REMEMBERED_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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

    const toBase64Url = (value) => {
        const bytes = value instanceof Uint8Array ? value : encoder.encode(value);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    };

    const fromBase64Url = (value) => {
        const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
        return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    };

    const cookieValue = (name) => {
        const cookie = request.headers.get('Cookie') || '';
        const part = cookie.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
        return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
    };

    const sessionKey = async () => {
        if (!env.SESSION_SECRET) return null;
        return crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    };

    const createSession = async (subject, remember = false) => {
        const key = await sessionKey();
        if (!key) return null;
        const expiresIn = remember ? REMEMBERED_SESSION_DURATION_MS : SESSION_DURATION_MS;
        const payload = toBase64Url(JSON.stringify({ sub: String(subject), exp: Date.now() + expiresIn }));
        const signature = toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
        return { token: `${payload}.${signature}`, maxAge: Math.floor(expiresIn / 1000) };
    };

    const verifySession = async () => {
        const token = cookieValue(SESSION_COOKIE);
        const key = await sessionKey();
        if (!token || !key) return null;
        const [payload, signature] = token.split('.');
        if (!payload || !signature) return null;
        try {
            const isValid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(payload));
            if (!isValid) return null;
            const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
            return data?.sub && Number(data.exp) > Date.now() ? data : null;
        } catch (_) {
            return null;
        }
    };

    const publicStudent = (student) => student ? {
        id: student.id, phone: student.phone, name: student.name, grade: student.grade,
        gender: student.gender, title: student.title, xp: student.xp, watch_mins: student.watch_mins,
        role: student.role, can_post_feed: student.can_post_feed,
        completed_lecture_ids: student.completed_lecture_ids, created_at: student.created_at
    } : null;

    const authenticatedUser = async (d1) => {
        const session = await verifySession();
        if (!session || !d1) return null;
        const student = await d1.prepare('SELECT * FROM students_table WHERE phone = ? OR id = ?').bind(session.sub, session.sub).first();
        return publicStudent(student);
    };

    const adminUser = async (d1) => {
        const user = await authenticatedUser(d1);
        return user?.role === 'admin' ? user : null;
    };

    // Cloudflare Pages runs over HTTPS. Omitting Secure only for an explicit
    // local HTTP preview keeps the same login flow testable with pages dev.
    const secureCookieAttribute = url.protocol === 'https:' ? '; Secure' : '';
    const sessionCookie = (token, maxAge) => `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secureCookieAttribute}; SameSite=Strict; Max-Age=${maxAge}`;
    const expiredSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly${secureCookieAttribute}; SameSite=Strict; Max-Age=0`;

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }

    // Authentication uses an HttpOnly, signed session cookie. Every protected
    // request reads the role from D1 again, so a revoked grant works at once.
    if (pathname === '/api/auth/login' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ error: 'Authentication service is unavailable.' }, 503);
        if (!env.SESSION_SECRET) return jsonResponse({ error: 'Authentication is not configured.' }, 503);
        try {
            const { id, password, remember } = await request.json();
            if (!id || !password) return jsonResponse({ error: 'ID and password are required.' }, 400);
            const student = await env.DB.prepare('SELECT * FROM students_table WHERE phone = ? OR id = ?')
                .bind(String(id), String(id)).first();
            if (!student || student.password !== password) return jsonResponse({ error: 'Invalid credentials.' }, 401);

            const session = await createSession(student.phone, Boolean(remember));
            if (!session) return jsonResponse({ error: 'Authentication is not configured.' }, 503);
            const response = jsonResponse({ user: publicStudent(student) });
            response.headers.set('Set-Cookie', sessionCookie(session.token, session.maxAge));
            return response;
        } catch (err) {
            return jsonResponse({ error: err.message }, 400);
        }
    }

    if (pathname === '/api/auth/session' && request.method === 'GET') {
        const user = await authenticatedUser(env.DB);
        return user ? jsonResponse({ user }) : jsonResponse({ error: 'Unauthenticated.' }, 401);
    }

    if (pathname === '/api/auth/logout' && request.method === 'POST') {
        const response = jsonResponse({ success: true });
        response.headers.set('Set-Cookie', expiredSessionCookie());
        return response;
    }

    // 🤖 2. SECURE CEREBRAS & GROQ AI PROXY ENDPOINT (/api/ai/chat)
    if (pathname === '/api/ai/chat' && request.method === 'POST') {
        try {
            const body = await request.json();
            const cerebrasKey = env.CEREBRAS_API_KEY;
            if (!cerebrasKey) return jsonResponse({ error: 'AI service is not configured yet.' }, 503);

            const aiResponse = await fetch('https://api.cerebras.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cerebrasKey}`
                },
                body: JSON.stringify(body)
            });

            if (aiResponse.ok) {
                const data = await aiResponse.json();
                return jsonResponse(data, 200);
            }

            const groqKey = env.GROQ_API_KEY;
            if (!groqKey) return jsonResponse({ error: 'AI service is temporarily unavailable.' }, 503);
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`
                },
                body: JSON.stringify({
                    model: 'openai/gpt-oss-120b',
                    messages: body.messages,
                    temperature: body.temperature || 0.7,
                    max_tokens: body.max_tokens || 800
                })
            });

            const groqData = await groqResponse.json();
            return jsonResponse(groqData, groqResponse.status);
        } catch (err) {
            return jsonResponse({ error: err.message }, 500);
        }
    }

        // 🗄️ 3. CLOUDFLARE D1 DATABASE API ENDPOINTS (/api/db/*)
    // Matches exact table names in D1: students_table, videos_table, materials_table, feed_table, portal_feedbacks
    if (pathname.startsWith('/api/db/')) {
        const d1 = env.DB;
        const requireAdmin = async () => adminUser(d1);

        // --- STUDENTS TABLE ENDPOINTS ---
        if (pathname === '/api/db/students') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM students_table ORDER BY xp DESC, watch_mins DESC').all();
                    return jsonResponse((results || []).map(publicStudent));
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const student = await request.json();
                    const admin = await requireAdmin();
                    const user = admin || await authenticatedUser(d1);
                    const studentId = String(student.phone || student.id || '');
                    const isSelfUpdate = user && (String(user.phone) === studentId || String(user.id) === studentId);
                    if (!admin && !isSelfUpdate) return jsonResponse({ error: 'Administrator access required.' }, 403);
                    if (d1) {
                        // Students may save only their own progress. Account and
                        // role changes are reserved for an admin grant.
                        if (!admin) {
                            await d1.prepare(`
                                UPDATE students_table SET xp = ?, watch_mins = ?, completed_lecture_ids = ?
                                WHERE phone = ? OR id = ?
                            `).bind(
                                student.xp || 0,
                                student.watch_mins || 0,
                                JSON.stringify(student.completed_lecture_ids || []),
                                studentId, studentId
                            ).run();
                            return jsonResponse({ success: true, message: 'Student progress updated.' });
                        }
                        await d1.prepare(`
                            INSERT INTO students_table (phone, name, password, grade, gender, title, xp, watch_mins, role, can_post_feed, completed_lecture_ids)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(phone) DO UPDATE SET
                                name = excluded.name,
                                password = CASE WHEN ? THEN excluded.password ELSE students_table.password END,
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
                            student.grade || 'Grade 10 (Secondary 1)',
                            student.gender || 'Boy',
                            student.title || null,
                            student.xp || 0,
                            student.watch_mins || 0,
                            student.role || 'student',
                            student.can_post_feed ? 1 : 0,
                            JSON.stringify(student.completed_lecture_ids || []),
                            student.password ? 1 : 0
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

        if (pathname === '/api/db/students/xp' && request.method === 'POST') {
            try {
                const { id, xpAmount } = await request.json();
                if (!await requireAdmin()) return jsonResponse({ error: 'Administrator access required.' }, 403);
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
            if (!await requireAdmin()) return jsonResponse({ error: 'Administrator access required.' }, 403);
            if (d1 && studentId) {
                await d1.prepare('DELETE FROM students_table WHERE phone = ? OR id = ?').bind(studentId, studentId).run();
                return jsonResponse({ success: true, message: 'Student record removed.' });
            }
            return jsonResponse({ success: true });
        }

        // --- VIDEOS / LECTURES ENDPOINTS ---
        if (pathname === '/api/db/lectures') {
            if (request.method === 'GET') {
                if (d1) {
                    const { results } = await d1.prepare('SELECT * FROM videos_table ORDER BY id ASC').all();
                    return jsonResponse(results || []);
                }
                return jsonResponse([]);
            }

            if (request.method === 'POST') {
                try {
                    const lec = await request.json();
                    if (!await requireAdmin()) return jsonResponse({ error: 'Administrator access required.' }, 403);
                    if (!d1) return jsonResponse({ error: 'D1 database binding "DB" is unavailable.' }, 503);
                    const result = await d1.prepare(`
                        INSERT INTO videos_table (title, description, lesson, grade, filename, archive_url, duration_mins)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        lec.title,
                        lec.description || '',
                        lec.lesson || '1',
                        String(lec.grade || 'Grade 10 (Secondary 1)'),
                        lec.filename || lec.archive_url || 'video.mp4',
                        lec.archive_url || lec.filename || '',
                        lec.duration_mins || 45
                    ).run();
                    return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Lecture registered in D1.' });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/lectures/') && request.method === 'DELETE') {
            const lecId = pathname.split('/').pop();
            if (!await requireAdmin()) return jsonResponse({ error: 'Administrator access required.' }, 403);
            if (d1 && lecId) {
                await d1.prepare('DELETE FROM videos_table WHERE id = ?').bind(lecId).run();
                return jsonResponse({ success: true, message: 'Lecture deleted.' });
            }
            return jsonResponse({ success: true });
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
                    if (!await requireAdmin()) return jsonResponse({ error: 'Administrator access required.' }, 403);
                    if (d1) {
                        const result = await d1.prepare(`
                            INSERT INTO materials_table (title, type, grade, desc, filename)
                            VALUES (?, ?, ?, ?, ?)
                        `).bind(
                            mat.title,
                            mat.type || 'Worksheet',
                            parseInt(mat.grade) || 10,
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
            if (!await requireAdmin()) return jsonResponse({ error: 'Administrator access required.' }, 403);
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

        if (pathname.startsWith('/api/db/feedbacks/') && request.method === 'DELETE') {
            const fbId = pathname.split('/').pop();
            if (d1 && fbId) {
                await d1.prepare('DELETE FROM portal_feedbacks WHERE id = ?').bind(fbId).run();
                return jsonResponse({ success: true, message: 'Feedback removed.' });
            }
            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'D1 endpoint not found.' }, 404);
    }

    // This is a catch-all Pages Function. Let regular site URLs continue to
    // the static asset handler so / serves index.html instead of API JSON.
    return context.next();
}
