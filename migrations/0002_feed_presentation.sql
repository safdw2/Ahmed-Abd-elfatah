-- Run this ONCE only if the feed_table already existed before this update.
-- New databases get these columns directly from schema.sql.
ALTER TABLE feed_table ADD COLUMN xp INTEGER DEFAULT 0;
ALTER TABLE feed_table ADD COLUMN level_title TEXT DEFAULT 'Novice Scientist 🟢';
ALTER TABLE feed_table ADD COLUMN author_role TEXT DEFAULT 'Student';
ALTER TABLE feed_table ADD COLUMN author_gender TEXT DEFAULT 'Boy';
ALTER TABLE feed_table ADD COLUMN author_title TEXT;
ALTER TABLE feed_table ADD COLUMN font_size TEXT DEFAULT '13px';
ALTER TABLE feed_table ADD COLUMN text_color TEXT;
ALTER TABLE feed_table ADD COLUMN attachment_type TEXT;
ALTER TABLE feed_table ADD COLUMN attachment_url TEXT;
