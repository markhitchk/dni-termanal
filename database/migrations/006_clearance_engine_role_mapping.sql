-- DNI Clearance Core — Step 2
-- Server-side Discord role -> clearance mapping.
--
-- Unknown/missing rank role IDs are intentionally not guessed. This migration
-- maps only role IDs already present in the server-side DNI role registry.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Remove any stale clearance assignments for the roles controlled here so a
-- previous lower/higher mapping cannot survive as an additional MAX() grant.
DELETE FROM dni_discord_role_clearances
WHERE discord_role_id IN (
    '1107373118412030063', '1429298416189444256', '1427346068999377038',
    '1128424017842425988', '1107373170484314174',
    '1420736520184266752', '1424476471325622333', '1424476500379435170', '1420736542137122856',
    '1423725666330738839', '1423725710589300796',
    '1424475940263825418', '1424476432364732568', '1420736834710929458', '1420736749524750397', '1420736707262939207',
    '1107373384469331999', '1107373350499663964', '1109966471427260487', '1107373308770521209',
    '1424475811733442650', '1424475870365483178', '1424475907267104899',
    '1109967178922479647', '1107373469869539368', '1107373434788401163',
    '1107374226496827553'
);

INSERT INTO dni_discord_role_clearances (discord_role_id, clearance_level) VALUES
    -- CLA/DIS — Absolute
    ('1107373118412030063', 6), -- HC-3 | Lord Sovereign / Owner
    ('1429298416189444256', 6), -- Admin
    ('1427346068999377038', 6), -- HC-2S | High Lords
    ('1128424017842425988', 6), -- HC-2
    ('1107373170484314174', 6), -- HC-1

    -- CL4/MET — O-6 through O-9
    ('1420736520184266752', 5), -- O-6
    ('1424476471325622333', 5), -- O-7
    ('1424476500379435170', 5), -- O-8
    ('1420736542137122856', 5), -- O-9

    -- CL3/CON — E-9/E-9S and O-1 through O-5
    ('1423725666330738839', 4), -- E-9
    ('1423725710589300796', 4), -- E-9S
    ('1424475940263825418', 4), -- O-1
    ('1424476432364732568', 4), -- O-2
    ('1420736834710929458', 4), -- O-3
    ('1420736749524750397', 4), -- O-4
    ('1420736707262939207', 4), -- O-5

    -- CL2/VER — E-5 through E-8, W-1 through W-3
    ('1107373384469331999', 3), -- E-5
    ('1107373350499663964', 3), -- E-6
    ('1109966471427260487', 3), -- E-7
    ('1107373308770521209', 3), -- E-8
    ('1424475811733442650', 3), -- W-1
    ('1424475870365483178', 3), -- W-2
    ('1424475907267104899', 3), -- W-3

    -- CL1/FOR — known E-2 through E-4. E-1 ID is not currently known.
    ('1109967178922479647', 2), -- E-2
    ('1107373469869539368', 2), -- E-3
    ('1107373434788401163', 2), -- E-4

    -- CL0/UTO — baseline DNI member
    ('1107374226496827553', 1); -- Imperial
