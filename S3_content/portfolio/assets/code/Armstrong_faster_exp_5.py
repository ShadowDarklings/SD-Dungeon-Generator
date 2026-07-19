#!/usr/bin/env python3

import argparse
import time


MIN_NUMBER = 10
MAX_NUMBER = 100_000_000


def parse_args():
    parser = argparse.ArgumentParser(
        description="Find Armstrong numbers quickly using digit multisets instead of brute force."
    )
    parser.add_argument("-n", "--number", type=int, default=MAX_NUMBER, help="maximum number to search to")
    return parser.parse_args()


def validate_limit(limit):
    if limit < MIN_NUMBER:
        raise ValueError("Maximum number must be at least 10.")


def build_power_table(max_digits):
    return [[digit ** digit_count for digit in range(10)] for digit_count in range(max_digits + 1)]


def digit_counts(number):
    counts = [0] * 10
    for digit in str(number):
        counts[ord(digit) - ord("0")] += 1
    return tuple(counts)


def generate_digit_count_sets(total_digits, digit=0, remaining=None, counts=None):
    if remaining is None:
        remaining = total_digits
    if counts is None:
        counts = [0] * 10

    if digit == 9:
        counts[digit] = remaining
        yield tuple(counts)
        counts[digit] = 0
        return

    for count in range(remaining + 1):
        counts[digit] = count
        yield from generate_digit_count_sets(total_digits, digit + 1, remaining - count, counts)
    counts[digit] = 0


def sum_for_counts(counts, powers):
    total = 0
    for digit, count in enumerate(counts):
        if count:
            total += count * powers[digit]
    return total


def find_armstrong_numbers(limit):
    max_digits = len(str(limit))
    power_table = build_power_table(max_digits)
    found = set()

    for digit_count in range(2, max_digits + 1):
        lower_bound = 10 ** (digit_count - 1)
        upper_bound = min(limit, 10**digit_count - 1)

        if lower_bound > limit:
            break

        powers = power_table[digit_count]
        for counts in generate_digit_count_sets(digit_count):
            candidate = sum_for_counts(counts, powers)

            if candidate < lower_bound or candidate > upper_bound:
                continue

            if digit_counts(candidate) == counts:
                found.add(candidate)

    return sorted(found)


def main():
    args = parse_args()

    try:
        validate_limit(args.number)
    except ValueError as error:
        print(f"Error: {error}")
        return 1

    start_time = time.perf_counter()
    armstrong_numbers = find_armstrong_numbers(args.number)
    elapsed_ms = int((time.perf_counter() - start_time) * 1000)

    print(f"It took {elapsed_ms} milliseconds to complete the task.")
    print("Armstrong numbers found: " + ", ".join(str(number) for number in armstrong_numbers))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())