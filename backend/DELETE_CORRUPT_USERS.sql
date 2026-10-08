-- Delete corrupt users that cannot generate tokens (FK constraint violation)
-- These users exist in users table but data is corrupted
-- Only Doni (moderator) and user roles remain valid

-- Step 1: VERIFY which users will be deleted (run this first to check)
SELECT COUNT(*) as corrupt_users_count,
       id, email, name, role 
FROM users 
WHERE id IN (
  '243f39dd-4a01-40b7-bbf9-a3520ef57b2b',
  'ff54e84d-10da-411c-9cc5-cc37787c1f77',
  '762017ab-2f96-48de-a057-764b32cba236',
  '955d1788-8187-443c-929b-8a865ca9f9df',
  '6c6b4fe7-d00c-41f2-91c6-1c20d00919ce',
  '94dfe9a5-4882-4be7-a458-120a18285fb9',
  '9b2fb217-40d3-48ee-9bb0-7e55a72d5024',
  'be9fc639-c5aa-4f74-9aba-d09cb9909064',
  '96710f7c-9438-4c8b-9119-9cafb3673771',
  '23854c7d-305e-4cd8-aa34-f08d845f3faf',
  '9aa2dd95-da16-40be-bb0b-0dda132b4bdd',
  '86b1252a-c7f6-4d78-af34-c0820482ea16',
  '008f6c71-fcd0-4ed3-b313-b7aa1c15c0e5',
  '8293510d-4676-404b-9c3b-292c610e88a1',
  'fdac7a43-0b6d-4c87-bd38-a1d7a9dcc5d9',
  '16c40666-c485-4a73-99f6-983b3ac553ab',
  'db971364-8bf6-413f-8c91-21096e1f2e7f',
  'e9298442-e33e-4221-ba15-e5241ebaf271',
  '4a2dd3fe-6a5f-4bc8-99b3-b273756f41ed',
  '0f326ce0-9623-4bb8-bd2f-9850ab45d9b2',
  'ab8cf298-35aa-41ed-aff6-d0e398d150ab',
  'f104d147-67d5-49cc-9a44-40917ef91ec6'
);

-- Step 2: DELETE corrupt users (only run after verifying step 1)
-- This will also cascade delete related records due to FK constraints
DELETE FROM users 
WHERE id IN (
  '243f39dd-4a01-40b7-bbf9-a3520ef57b2b',  -- Admin Zona 01
  'ff54e84d-10da-411c-9cc5-cc37787c1f77',  -- Admin Zona 03A
  '762017ab-2f96-48de-a057-764b32cba236',  -- Admin Zona 03B
  '955d1788-8187-443c-929b-8a865ca9f9df',  -- Admin Zona 05
  '6c6b4fe7-d00c-41f2-91c6-1c20d00919ce',  -- Admin Zona 06A
  '94dfe9a5-4882-4be7-a458-120a18285fb9',  -- Admin Zona 06B
  '9b2fb217-40d3-48ee-9bb0-7e55a72d5024',  -- Admin Zona 07
  'be9fc639-c5aa-4f74-9aba-d09cb9909064',  -- Admin Zona 08
  '96710f7c-9438-4c8b-9119-9cafb3673771',  -- Admin Zona 09
  '23854c7d-305e-4cd8-aa34-f08d845f3faf',  -- Admin Zona 10
  '9aa2dd95-da16-40be-bb0b-0dda132b4bdd',  -- Admin Zona 11
  '86b1252a-c7f6-4d78-af34-c0820482ea16',  -- Admin Zona 12
  '008f6c71-fcd0-4ed3-b313-b7aa1c15c0e5',  -- Admin Zona 13
  '8293510d-4676-404b-9c3b-292c610e88a1',  -- Admin Zona 14
  'fdac7a43-0b6d-4c87-bd38-a1d7a9dcc5d9',  -- Admin Zona 15
  '16c40666-c485-4a73-99f6-983b3ac553ab',  -- Admin Zona 16
  'db971364-8bf6-413f-8c91-21096e1f2e7f',  -- Admin Zona 17
  'e9298442-e33e-4221-ba15-e5241ebaf271',  -- Asep (super_admin)
  '4a2dd3fe-6a5f-4bc8-99b3-b273756f41ed',  -- Admin Zona 04
  '0f326ce0-9623-4bb8-bd2f-9850ab45d9b2',  -- Admin Zona 02
  'ab8cf298-35aa-41ed-aff6-d0e398d150ab',  -- Puput (super_admin)
  'f104d147-67d5-49cc-9a44-40917ef91ec6'   -- Arif (super_admin)
);

-- Step 3: Verify deletion was successful
SELECT COUNT(*) as remaining_users, COUNT(DISTINCT role) as roles FROM users;
