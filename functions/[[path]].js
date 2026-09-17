/**
 * 🚀 CLOUDFLARE PAGES SERVERLESS ROUTER ENGINE (functions/[[path]].js)
 * Architecture: Cloudflare Pages Functions + D1 Database + Secure AI API Proxy
 * Project: MR. Ahmed Abd-ElFatah - Unified Student Workspace Portal
 * 
 * 🗄️ D1 Database Binding: env.DB
 * 🆔 Database ID: 690c177a-0e63-4bcd-ae11-5fb684dd463f
 * 📛 Database Name: ahmedabdelfatah-db
 */

export async function onRequest(context) {
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

        // 📈 STUDENT PROGRESS ENDPOINT (/api/db/students/progress)
        // Called ONLY from markLectureCompleted() on the frontend when a
        // student finishes a video. Deliberately narrow: touches ONLY xp,
        // watch_mins and completed_lecture_ids — never password, name,
        // grade or role.
        //
        // Why this exists: the general /api/db/students upsert (above)
        // does `student.password || '123456'`. The frontend's currentUser
        // object never carries a password field (the login endpoint
        // strips it before sending the user back to the browser), so
        // every time a student finished a video and that upsert ran with
        // currentUser, it silently reset their real password back to
        // '123456' in D1. They'd keep typing their actual password on a
        // later login and get rejected as "invalid credentials" even
        // though the row was right there. Routing progress saves through
        // this endpoint instead means a video completion can never touch
        // the password column at all, no matter what the client sends.
        //
        // This also reads the row back after the write and returns the
        // authoritative values, instead of firing the request and trusting
        // it worked. The old call (D1.saveStudent(currentUser), unawaited
        // and unchecked) meant a dropped/failed request left the checkmark
        // and EXP showing locally while D1 still had the old row — the
        // next hydrateFromD1() would then overwrite local state with that
        // stale row, and the "finished" video would look unfinished again.
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
                        xp || 0,
                        watch_mins || 0,
                        JSON.stringify(completed_lecture_ids || []),
                        id, id
                    ).run();

                    const row = await d1.prepare('SELECT xp, watch_mins, completed_lecture_ids FROM students_table WHERE phone = ? OR id = ?')
                        .bind(id, id).first();

                    if (!row) return jsonResponse({ error: 'Student not found.' }, 404);
                    return jsonResponse({
                        success: true,
                        xp: row.xp,
                        watch_mins: row.watch_mins,
                        completed_lecture_ids: row.completed_lecture_ids,
                        message: 'Progress saved.'
                    });
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
                        return jsonResponse({ success: true, id: result.meta.last_row_id, message: 'Lecture registered in D1.' });
                    }
                    return jsonResponse({ success: true, mock: true });
                } catch (err) {
                    return jsonResponse({ error: err.message }, 400);
                }
            }
        }

        if (pathname.startsWith('/api/db/lectures/') && request.method === 'DELETE') {
            const lecId = pathname.split('/').pop();
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

        return jsonResponse({ error: 'D1 endpoint not found.' }, 404);
    }

    // This is a catch-all Pages Function. Let regular site URLs continue to
    // the static asset handler so / serves index.html instead of API JSON.
    return context.next();
}
