<?php

declare(strict_types=1);

require_once __DIR__ . '/dni-clearance.php';

/**
 * Count Unicode characters without requiring the optional mbstring extension.
 * Rocky/LAMP production hosts may intentionally run a minimal PHP extension set.
 */
function dni_operational_text_length(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }

    $characters = preg_match_all('/./us', $value, $matches);
    return $characters === false ? strlen($value) : $characters;
}

function dni_operational_classification_reason(mixed $value): string
{
    if (is_array($value) || is_object($value)) {
        throw new RuntimeException('Classification reason must be text.', 422);
    }

    $reason = trim((string)$value);
    if ($reason === '') {
        throw new RuntimeException('Classification reason is required.', 422);
    }
    if (dni_operational_text_length($reason) > 500) {
        throw new RuntimeException('Classification reason is too long.', 422);
    }
    return $reason;
}

function dni_operational_classification_type(mixed $value): string
{
    if (is_array($value) || is_object($value)) {
        throw new RuntimeException('Operational resource type must be text.', 422);
    }

    $type = strtolower(trim((string)$value));
    if (!in_array($type, ['sector', 'asset', 'personnel'], true)) {
        throw new RuntimeException('Unknown operational resource type.', 422);
    }
    return $type;
}

/**
 * Normalize the client/server classification contract.
 *
 * Canonical clients send an integer clearanceLevel. For compatibility with a
 * stale admin bundle, a descriptor object such as {"level":0} or a known code
 * such as "CL/NON" is also accepted. Every accepted representation is mapped
 * through the server catalog before the actor-clearance policy is evaluated.
 */
function dni_operational_classification_target_level(mixed $value): int
{
    if (is_array($value)) {
        if (array_key_exists('level', $value)) {
            $value = $value['level'];
        } elseif (array_key_exists('clearanceLevel', $value)) {
            $value = $value['clearanceLevel'];
        } elseif (array_key_exists('code', $value)) {
            $value = $value['code'];
        } else {
            throw new RuntimeException('Resource clearance is missing a valid level.', 422);
        }
    }

    if ($value === null || $value === '') {
        throw new RuntimeException('Resource clearance is required.', 422);
    }

    if (is_string($value)) {
        $value = trim($value);
        if ($value === '') {
            throw new RuntimeException('Resource clearance is required.', 422);
        }
        if (!ctype_digit($value)) {
            foreach (dni_clearance_catalog() as $descriptor) {
                if (strcasecmp($value, (string)$descriptor['code']) === 0) {
                    return (int)$descriptor['level'];
                }
            }
            throw new RuntimeException('Resource clearance code is not recognized.', 422);
        }
    }

    try {
        return dni_clearance_normalize_level($value);
    } catch (InvalidArgumentException $error) {
        throw new RuntimeException('Resource clearance must be a valid DNI clearance level.', 422, $error);
    }
}

function dni_operational_classification_history_level(int $oldLevel, int $newLevel): int
{
    return max(
        dni_clearance_normalize_level($oldLevel),
        dni_clearance_normalize_level($newLevel)
    );
}
