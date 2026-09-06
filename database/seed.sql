INSERT INTO users (
    id,
    email,
    name
)
VALUES
(
    '33333333-3333-3333-3333-333333333333',
    'owner@example.com',
    'Owner'
),
(
    '11111111-1111-1111-1111-111111111111',
    'person-a@example.com',
    'Person A'
),
(
    '22222222-2222-2222-2222-222222222222',
    'person-b@example.com',
    'Person B'
)
ON CONFLICT (id) DO NOTHING;


INSERT INTO media (
    id,
    owner_id,
    filename,
    storage_key,
    media_type
)
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    'test-video.mp4',
    'media/test-video.mp4',
    'video/mp4'
)
ON CONFLICT (id) DO NOTHING;


INSERT INTO shares (
    id,
    media_id,
    owner_id,
    status
)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    'ACTIVE'
)
ON CONFLICT (id) DO NOTHING;


INSERT INTO share_recipients (
    id,
    share_id,
    user_id,
    access_type,
    reference_user_id,
    max_distance_meters,
    max_location_age_seconds,
    status
)
VALUES
(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    'UNRESTRICTED',
    NULL,
    NULL,
    30,
    'ACTIVE'
),
(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'PROXIMITY',
    '11111111-1111-1111-1111-111111111111',
    500,
    30,
    'ACTIVE'
)
ON CONFLICT (id) DO NOTHING;