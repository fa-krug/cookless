from __future__ import annotations

from recipes.programs import validate_program_step


class TestManualCooking:
    def test_valid(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=100,
            duration_seconds=300,
            speed=5,
            direction="LEFT",
            turbo=False,
            weight_grams=None,
        )
        assert errors == []

    def test_missing_temperature(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=None,
            duration_seconds=300,
            speed=5,
            direction="LEFT",
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 1
        assert "temperature" in errors[0]

    def test_missing_all_required(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 4


class TestChopping:
    def test_valid(self):
        errors = validate_program_step(
            "CHOPPING",
            temperature=None,
            duration_seconds=60,
            speed=3,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert errors == []


class TestWeighing:
    def test_valid(self):
        errors = validate_program_step(
            "WEIGHING",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=500,
        )
        assert errors == []

    def test_missing_weight(self):
        errors = validate_program_step(
            "WEIGHING",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 1
        assert "weight_grams" in errors[0]


class TestPreCleaning:
    def test_no_params_needed(self):
        errors = validate_program_step(
            "PRE_CLEANING",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert errors == []


class TestRangeValidation:
    def test_temperature_out_of_range(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=200,
            duration_seconds=300,
            speed=5,
            direction="LEFT",
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 1
        assert "temperature" in errors[0]

    def test_speed_out_of_range(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=100,
            duration_seconds=300,
            speed=15,
            direction="LEFT",
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 1
        assert "speed" in errors[0]


class TestInvalidProgramType:
    def test_invalid_program_type(self):
        errors = validate_program_step(
            "INVALID_PROGRAM",
            temperature=None,
            duration_seconds=None,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 1
        assert "Invalid program_type" in errors[0]


class TestOverrides:
    def test_fermentation_temperature_max_60(self):
        errors = validate_program_step(
            "FERMENTATION",
            temperature=80,
            duration_seconds=3600,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 1
        assert "temperature" in errors[0]

    def test_slow_cooking_long_duration_valid(self):
        errors = validate_program_step(
            "SLOW_COOKING",
            temperature=80,
            duration_seconds=43200,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert errors == []

    def test_turbo_max_60_seconds(self):
        errors = validate_program_step(
            "TURBO",
            temperature=None,
            duration_seconds=120,
            speed=None,
            direction=None,
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 1
        assert "duration_seconds" in errors[0]


class TestDirection:
    def test_invalid_direction(self):
        errors = validate_program_step(
            "MANUAL_COOKING",
            temperature=100,
            duration_seconds=300,
            speed=5,
            direction="UP",
            turbo=False,
            weight_grams=None,
        )
        assert len(errors) == 1
        assert "direction" in errors[0]
