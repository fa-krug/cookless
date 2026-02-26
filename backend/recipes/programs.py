from __future__ import annotations

PROGRAM_PARAMS: dict[str, list[tuple[str, bool]]] = {
    "MANUAL_COOKING": [
        ("temperature", True),
        ("duration_seconds", True),
        ("speed", True),
        ("direction", True),
        ("turbo", False),
    ],
    "CHOPPING": [("duration_seconds", True), ("speed", True)],
    "KNEADING": [("duration_seconds", True)],
    "STEAMING": [("temperature", True), ("duration_seconds", True)],
    "BLENDING": [("duration_seconds", True)],
    "SEARING": [("temperature", True), ("duration_seconds", True), ("speed", True)],
    "SLOW_COOKING": [("temperature", True), ("duration_seconds", True)],
    "SOUS_VIDE": [("temperature", True), ("duration_seconds", True)],
    "WEIGHING": [("weight_grams", True)],
    "TURBO": [("duration_seconds", True)],
    "EGG_COOKING": [("duration_seconds", True)],
    "FERMENTATION": [("temperature", True), ("duration_seconds", True)],
    "PRE_CLEANING": [],
}

DEFAULT_RANGES: dict[str, tuple[int, int]] = {
    "temperature": (37, 130),
    "duration_seconds": (1, 5940),
    "speed": (1, 10),
    "weight_grams": (1, 5000),
}

RANGE_OVERRIDES: dict[str, dict[str, tuple[int, int]]] = {
    "SLOW_COOKING": {"duration_seconds": (1, 43200)},
    "SOUS_VIDE": {"duration_seconds": (1, 43200)},
    "FERMENTATION": {"temperature": (37, 60), "duration_seconds": (1, 43200)},
    "TURBO": {"duration_seconds": (1, 60)},
}

VALID_DIRECTIONS = {"LEFT", "RIGHT"}


def validate_program_step(
    program_type: str,
    *,
    temperature: int | None,
    duration_seconds: int | None,
    speed: int | None,
    direction: str | None,
    turbo: bool,
    weight_grams: int | None,
) -> list[str]:
    """Validate program step parameters. Returns list of error messages (empty = valid)."""
    errors: list[str] = []

    if program_type not in PROGRAM_PARAMS:
        return [f"Invalid program_type: {program_type}"]

    params = PROGRAM_PARAMS[program_type]
    overrides = RANGE_OVERRIDES.get(program_type, {})

    int_values: dict[str, int | None] = {
        "temperature": temperature,
        "duration_seconds": duration_seconds,
        "speed": speed,
        "weight_grams": weight_grams,
    }

    for field, required in params:
        if field == "turbo":
            continue

        if field == "direction":
            if required and direction is None:
                errors.append(f"{field} is required for {program_type}")
            elif direction is not None and direction not in VALID_DIRECTIONS:
                errors.append(f"direction must be one of {VALID_DIRECTIONS}, got {direction}")
            continue

        value = int_values.get(field)

        if required and value is None:
            errors.append(f"{field} is required for {program_type}")
            continue

        if value is None:
            continue

        range_min, range_max = overrides.get(field, DEFAULT_RANGES.get(field, (0, 999999)))
        if not (range_min <= value <= range_max):
            errors.append(f"{field} must be between {range_min} and {range_max}, got {value}")

    return errors
