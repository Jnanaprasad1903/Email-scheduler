INSERT INTO users (email, name, "updatedAt")
VALUES ('dev@test.com', 'Dev User', now())
ON CONFLICT (email) DO NOTHING
RETURNING id, email;
