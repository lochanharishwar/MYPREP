"""Deterministic first-order Markov removal effects; no LLM in the math."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta
import math

START, CONVERT, NULL = '__start__', '__conversion__', '__null__'

def solve(matrix, values):
    a = [list(row) + [float(v)] for row, v in zip(matrix, values)]
    n = len(a)
    for c in range(n):
        pivot = max(range(c, n), key=lambda r: abs(a[r][c]))
        if abs(a[pivot][c]) < 1e-12:
            raise ValueError('Transition system is singular; more varied journeys are required.')
        a[c], a[pivot] = a[pivot], a[c]
        divisor = a[c][c]
        a[c] = [v / divisor for v in a[c]]
        for r in range(n):
            if r != c:
                multiplier = a[r][c]
                a[r] = [v - multiplier * k for v, k in zip(a[r], a[c])]
    return [row[-1] for row in a]

def conversion_probability(transitions, removed=None):
    states = sorted({START} | {a for a, _ in transitions if a not in (CONVERT, NULL, removed)})
    index = {s: i for i, s in enumerate(states)}
    totals = Counter()
    for (source, _), count in transitions.items():
        totals[source] += count
    matrix = [[float(i == j) for j in range(len(states))] for i in range(len(states))]
    rhs = [0.0] * len(states)
    for (source, dest), count in transitions.items():
        if source not in index or dest == removed:
            continue  # Incoming probability for a removed channel is sent to nonconversion.
        p = count / totals[source]
        i = index[source]
        if dest == CONVERT:
            rhs[i] += p
        elif dest in index:
            matrix[i][index[dest]] -= p
    return solve(matrix, rhs)[index[START]]

def markov(paths, min_journeys=20, min_conversions=5):
    conversions = sum(bool(converted) for _, converted in paths)
    if len(paths) < min_journeys or conversions < min_conversions:
        return {'status': 'insufficient_data', 'reason': f'At least {min_journeys} observed journeys and {min_conversions} conversions are required. This operational minimum does not establish statistical significance.', 'journeys': len(paths), 'conversions': conversions, 'channels': []}
    transitions = Counter()
    channels = set()
    for touches, converted in paths:
        cleaned = []
        for channel in touches:
            if channel in (START, CONVERT, NULL):
                raise ValueError('Reserved channel name.')
            if not cleaned or cleaned[-1] != channel:
                cleaned.append(channel)
        channels.update(cleaned)
        sequence = [START] + cleaned + [CONVERT if converted else NULL]
        transitions.update(zip(sequence, sequence[1:]))
    if len(channels) > 100:
        return {'status': 'insufficient_data', 'reason': 'Normalize channel names to at most 100 channels before running the model.', 'channels': []}
    try:
        baseline = conversion_probability(transitions)
        if baseline <= 0:
            raise ValueError('No positive baseline conversion probability.')
        effects = {c: max(0.0, 1.0 - conversion_probability(transitions, c) / baseline) for c in channels}
        total = sum(effects.values())
        if total <= 1e-12 or not all(math.isfinite(v) for v in effects.values()):
            raise ValueError('Removal effects do not support a stable allocation.')
        return {'status': 'completed', 'baselineConversion': baseline, 'journeys': len(paths), 'conversions': conversions, 'channels': [{'channel': c, 'credit': effects[c] / total, 'removalEffect': effects[c]} for c in sorted(effects)], 'reason': 'Observed first-order Markov removal effects. Associational allocation, not causal lift. Recent nonconverting journeys may be incomplete.'}
    except ValueError as error:
        return {'status': 'unstable', 'reason': str(error), 'channels': []}

def paths_from_events(events, lookback_days=30, period_start=None, period_end=None):
    start = datetime.fromisoformat(period_start.replace('Z', '+00:00')) if period_start else None
    end = datetime.fromisoformat(period_end.replace('Z', '+00:00')) if period_end else None
    groups = defaultdict(list)
    for event in events:
        identity = event.get('journey_id') or ('customer:' + event['customer_id'] if event.get('customer_id') else 'anonymous:' + event['anonymous_id'] if event.get('anonymous_id') else None)
        if identity:
            groups[identity].append(event)
    paths = []
    for rows in groups.values():
        # ISO strings with different UTC offsets (or fractional precision) do
        # not sort chronologically. Compare instants, retaining ID tie-breaking.
        rows.sort(key=lambda e: (datetime.fromisoformat(e['occurred_at'].replace('Z', '+00:00')), e.get('id') or ''))
        touches = []
        for event in rows:
            at = datetime.fromisoformat(event['occurred_at'].replace('Z', '+00:00'))
            if end and at >= end:
                continue
            cutoff = at - timedelta(days=lookback_days)
            touches = [(t, c) for t, c in touches if t >= cutoff]
            if event['type'] in ('page_view', 'click', 'engaged', 'video_progress'):
                touches.append((at, event.get('channel') or 'direct'))
            elif event['type'] == 'purchase' and event.get('source') != 'browser':
                if not start or at >= start:
                    paths.append(([c for _, c in touches], True))
                touches = []
        if touches and (not start or touches[-1][0] >= start):
            paths.append(([c for _, c in touches], False))
    return paths
