INSERT OR IGNORE INTO posts (
  id,
  slug,
  title,
  description,
  content_markdown,
  status,
  pub_date
) VALUES (
  'post_hello_backend',
  'hello-backend',
  'Hello Backend',
  'A test post from Cloudflare D1.',
  '# Hello Backend\n\nThis post is stored in Cloudflare D1.',
  'PUBLISHED',
  '2026-07-03T00:00:00.000Z'
);

INSERT OR IGNORE INTO tags (id, name)
VALUES ('tag_backend', 'Backend');

INSERT OR IGNORE INTO post_tags (post_id, tag_id)
VALUES ('post_hello_backend', 'tag_backend');
