from __future__ import annotations

from datetime import date, timedelta


def validate_shopping_days(shopping_days: list[int]) -> None:
    """Validate shopping day configuration.

    Args:
        shopping_days: List of weekday integers (0=Monday .. 6=Sunday).

    Raises:
        ValueError: If the configuration is invalid.
    """
    if len(shopping_days) == 0:
        raise ValueError("Must configure at least 1 shopping day")
    if len(shopping_days) > 2:
        raise ValueError("Must configure at most 2 shopping days")

    for day in shopping_days:
        if day < 0 or day > 6:
            raise ValueError(f"Invalid weekday: {day}. Must be 0-6.")

    if len(shopping_days) == 2:
        a, b = sorted(shopping_days)
        gap = b - a
        circular_gap = min(gap, 7 - gap)
        if circular_gap < 3:
            raise ValueError("Shopping days must be at least 3 days apart")


def compute_iteration_dates(
    requested_start: date,
    shopping_days: list[int],
    iteration_weeks: int,
) -> tuple[date, date]:
    """Compute iteration start and end dates.

    The iteration starts on the requested date (typically today) and spans
    the given number of weeks.

    Args:
        requested_start: The desired start date (typically today).
        shopping_days: List of weekday integers (0=Monday .. 6=Sunday).
            Kept for API compatibility but no longer affects start date.
        iteration_weeks: Number of weeks in the iteration.

    Returns:
        Tuple of (start_date, end_date).
    """
    start = requested_start
    end = start + timedelta(weeks=iteration_weeks) - timedelta(days=1)
    return start, end


def compute_shopping_segments(
    start_date: date,
    end_date: date,
    shopping_days: list[int],
) -> list[tuple[date, date, date]]:
    """Compute shopping segments within an iteration.

    Returns:
        List of (segment_start, shopping_date, segment_end) tuples.
    """
    shopping_set = set(shopping_days)

    # Collect all shopping day occurrences within [start_date, end_date]
    shopping_dates: list[date] = []
    current = start_date
    while current <= end_date:
        if current.weekday() in shopping_set:
            shopping_dates.append(current)
        current += timedelta(days=1)

    # Drop any shopping date on the last day (nothing to cover after it)
    if shopping_dates and shopping_dates[-1] == end_date:
        shopping_dates.pop()

    # Edge case: no shopping dates found
    if not shopping_dates:
        return [(start_date, start_date, end_date)]

    segments: list[tuple[date, date, date]] = []
    for i, shop_date in enumerate(shopping_dates):
        # First segment starts at start_date; subsequent segments start at the shopping date
        seg_start = start_date if i == 0 else shop_date

        # Segment ends at next_shopping_date - 1, or end_date for last segment
        if i + 1 < len(shopping_dates):
            seg_end = shopping_dates[i + 1] - timedelta(days=1)
        else:
            seg_end = end_date

        segments.append((seg_start, shop_date, seg_end))

    return segments
