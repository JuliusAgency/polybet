-- Seed: Test users for local development
-- Creates 1 super_admin, 1 manager, 3 users
-- Login: username only (email = username@polybet.internal)

DO $$
DECLARE
  admin_id    uuid := '00000000-0000-0000-0000-000000000001';
  manager_id  uuid := '00000000-0000-0000-0000-000000000002';
  user1_id    uuid := '00000000-0000-0000-0000-000000000003';
  user2_id    uuid := '00000000-0000-0000-0000-000000000004';
  user3_id    uuid := '00000000-0000-0000-0000-000000000005';
BEGIN

  -- Auth users
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES
    (admin_id,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@polybet.internal',   crypt('Admin123!',   gen_salt('bf')), now(),
     '', '', '', '',
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),

    (manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'manager@polybet.internal', crypt('Manager123!', gen_salt('bf')), now(),
     '', '', '', '',
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),

    (user1_id,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'user1@polybet.internal',   crypt('User123!',    gen_salt('bf')), now(),
     '', '', '', '',
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),

    (user2_id,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'user2@polybet.internal',   crypt('User123!',    gen_salt('bf')), now(),
     '', '', '', '',
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false),

    (user3_id,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'user3@polybet.internal',   crypt('User123!',    gen_salt('bf')), now(),
     '', '', '', '',
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), false, false)
  ON CONFLICT (id) DO NOTHING;

  -- Profiles
  INSERT INTO profiles (id, username, full_name, role, is_active, created_at)
  VALUES
    (admin_id,   'admin',   'System Administrator', 'super_admin', true, now()),
    (manager_id, 'manager', 'Test Manager',         'manager',     true, now()),
    (user1_id,   'user1',   'Test User 1',          'user',        true, now()),
    (user2_id,   'user2',   'Test User 2',          'user',        true, now()),
    (user3_id,   'user3',   'Test User 3',          'user',        true, now())
  ON CONFLICT (id) DO NOTHING;

  -- Managers table (super_admin + manager)
  INSERT INTO managers (id, balance, margin)
  VALUES
    (admin_id,   0, 0),
    (manager_id, 0, 5)
  ON CONFLICT (id) DO NOTHING;

  -- Balances for users
  INSERT INTO balances (user_id, available, in_play, updated_at)
  VALUES
    (user1_id, 1000, 0, now()),
    (user2_id, 1000, 0, now()),
    (user3_id, 1000, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  -- Link users to manager
  INSERT INTO manager_user_links (manager_id, user_id)
  VALUES
    (manager_id, user1_id),
    (manager_id, user2_id),
    (manager_id, user3_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Test users created successfully';
END;
$$;
