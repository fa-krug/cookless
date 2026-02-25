from datetime import date

import pytest

from planner.iteration_utils import (
    compute_iteration_dates,
    compute_shopping_segments,
    validate_shopping_days,
)


class TestValidateShoppingDays:
    def test_single_day_valid(self):
        validate_shopping_days([5])  # Saturday

    def test_two_days_valid(self):
        validate_shopping_days([0, 3])  # Mon + Thu (3 apart)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="at least 1"):
            validate_shopping_days([])

    def test_three_days_raises(self):
        with pytest.raises(ValueError, match="at most 2"):
            validate_shopping_days([0, 2, 4])

    def test_two_days_too_close_raises(self):
        with pytest.raises(ValueError, match="at least 3 days apart"):
            validate_shopping_days([0, 1])  # Mon + Tue

    def test_two_days_wrapping_too_close_raises(self):
        with pytest.raises(ValueError, match="at least 3 days apart"):
            validate_shopping_days([6, 0])  # Sun + Mon

    def test_two_days_wrapping_valid(self):
        validate_shopping_days([5, 1])  # Sat + Tue (3 apart via wrap)

    def test_invalid_weekday_raises(self):
        with pytest.raises(ValueError):
            validate_shopping_days([7])

    def test_negative_weekday_raises(self):
        with pytest.raises(ValueError):
            validate_shopping_days([-1])


class TestComputeIterationDates:
    def test_starts_on_requested_date(self):
        start, end = compute_iteration_dates(date(2026, 2, 25), [5], iteration_weeks=1)
        assert start == date(2026, 2, 25)  # Wed, starts today
        assert end == date(2026, 3, 3)  # Wed + 7 - 1 = Tue

    def test_one_week_span(self):
        start, end = compute_iteration_dates(date(2026, 2, 28), [5], iteration_weeks=1)
        assert start == date(2026, 2, 28)
        assert end == date(2026, 3, 6)

    def test_two_weeks(self):
        start, end = compute_iteration_dates(date(2026, 2, 28), [5], iteration_weeks=2)
        assert start == date(2026, 2, 28)
        assert end == date(2026, 3, 13)

    def test_shopping_days_do_not_affect_start(self):
        # shopping on Wed(2) + Sat(5), start date is Thu(3)
        start, end = compute_iteration_dates(date(2026, 2, 26), [2, 5], iteration_weeks=1)
        assert start == date(2026, 2, 26)  # Thu, no snapping
        assert end == date(2026, 3, 4)


class TestComputeShoppingSegments:
    def test_single_shopping_day_one_week(self):
        segments = compute_shopping_segments(date(2026, 2, 28), date(2026, 3, 6), [5])
        assert len(segments) == 1
        assert segments[0] == (date(2026, 2, 28), date(2026, 2, 28), date(2026, 3, 6))

    def test_single_shopping_day_two_weeks(self):
        segments = compute_shopping_segments(date(2026, 2, 28), date(2026, 3, 13), [5])
        assert len(segments) == 2
        assert segments[0] == (date(2026, 2, 28), date(2026, 2, 28), date(2026, 3, 6))
        assert segments[1] == (date(2026, 3, 7), date(2026, 3, 7), date(2026, 3, 13))

    def test_two_shopping_days_two_weeks(self):
        # Wed Mar 4 – Tue Mar 17, shop Wed(2) + Sat(5)
        segments = compute_shopping_segments(date(2026, 3, 4), date(2026, 3, 17), [2, 5])
        assert len(segments) == 4
        assert segments[0] == (date(2026, 3, 4), date(2026, 3, 4), date(2026, 3, 6))
        assert segments[1] == (date(2026, 3, 7), date(2026, 3, 7), date(2026, 3, 10))
        assert segments[2] == (date(2026, 3, 11), date(2026, 3, 11), date(2026, 3, 13))
        assert segments[3] == (date(2026, 3, 14), date(2026, 3, 14), date(2026, 3, 17))

    def test_no_shopping_dates_returns_single_segment(self):
        # Edge case: shopping day doesn't occur in range
        # Mon-Tue range, shopping on Fri(4)
        segments = compute_shopping_segments(date(2026, 3, 2), date(2026, 3, 3), [4])
        assert len(segments) == 1
        assert segments[0] == (date(2026, 3, 2), date(2026, 3, 2), date(2026, 3, 3))
