import unittest
from attribution import markov, paths_from_events, solve

class AttributionTests(unittest.TestCase):
    def test_known_linear_system(self):
        self.assertEqual(solve([[2, 0], [0, 4]], [6, 8]), [3, 2])

    def test_symmetric_channels_equal_credit(self):
        paths = [(['search'], True), (['social'], True), (['search'], False), (['social'], False)] * 10
        result = markov(paths)
        self.assertEqual(result['status'], 'completed')
        self.assertAlmostEqual(result['baselineConversion'], .5)
        self.assertEqual([r['credit'] for r in result['channels']], [.5, .5])

    def test_conversion_channel_receives_credit(self):
        result = markov([(['email'], True)] * 10 + [(['social'], False)] * 10)
        values = {r['channel']: r['credit'] for r in result['channels']}
        self.assertAlmostEqual(values['email'], 1)
        self.assertAlmostEqual(values['social'], 0)

    def test_small_samples_are_not_fabricated(self):
        self.assertEqual(markov([(['x'], True)])['status'], 'insufficient_data')

    def test_sequence_removal_and_normalization(self):
        result = markov([(['search', 'social'], True)] * 10 + [(['search'], False)] * 10)
        self.assertEqual(result['status'], 'completed')
        self.assertAlmostEqual(sum(r['credit'] for r in result['channels']), 1)

    def test_no_browser_purchase_as_conversion(self):
        rows = [{'id': '1', 'anonymous_id': 'a', 'occurred_at': '2026-01-01T00:00:00Z', 'type': 'click', 'channel': 'social'}, {'id': '2', 'anonymous_id': 'a', 'occurred_at': '2026-01-02T00:00:00Z', 'type': 'purchase', 'source': 'browser'}]
        self.assertEqual(paths_from_events(rows), [(['social'], False)])

    def test_lookback_excludes_old_touch(self):
        rows = [{'id': '1', 'customer_id': 'a', 'occurred_at': '2026-01-01T00:00:00Z', 'type': 'click', 'channel': 'social'}, {'id': '2', 'customer_id': 'a', 'occurred_at': '2026-03-02T00:00:00Z', 'type': 'purchase', 'source': 'server'}]
        self.assertEqual(paths_from_events(rows), [([], True)])

    def test_mixed_offsets_and_out_of_order_events_use_actual_instants(self):
        rows = [
            {'id':'purchase','customer_id':'a','occurred_at':'2026-01-01T10:00:00Z','type':'purchase','source':'server'},
            {'id':'after','customer_id':'a','occurred_at':'2026-01-01T09:45:00-01:00','type':'click','channel':'email'},
            {'id':'before','customer_id':'a','occurred_at':'2026-01-01T15:00:00+05:30','type':'click','channel':'social'},
        ]
        expected = [(['social'], True), (['email'], False)]
        self.assertEqual(paths_from_events(rows), expected)
        self.assertEqual(paths_from_events(list(reversed(rows))), expected)

    def test_fractional_precision_and_equivalent_offsets_keep_stable_order(self):
        rows = [
            {'id':'2','anonymous_id':'a','occurred_at':'2026-01-01T10:00:00Z','type':'click','channel':'search'},
            {'id':'3','anonymous_id':'a','occurred_at':'2026-01-01T10:00:00.900Z','type':'purchase','source':'server'},
            {'id':'1','anonymous_id':'a','occurred_at':'2026-01-01T15:30:00+05:30','type':'click','channel':'social'},
        ]
        expected = [(['social', 'search'], True)]
        self.assertEqual(paths_from_events(rows), expected)
        self.assertEqual(paths_from_events(list(reversed(rows))), expected)

    def test_window_warmup_does_not_count_old_conversions(self):
        rows = [{'id':'1','customer_id':'a','occurred_at':'2026-01-01T00:00:00Z','type':'click','channel':'social'}, {'id':'2','customer_id':'a','occurred_at':'2026-01-02T00:00:00Z','type':'purchase','source':'server'}, {'id':'3','customer_id':'a','occurred_at':'2026-01-10T00:00:00Z','type':'purchase','source':'server'}]
        self.assertEqual(paths_from_events(rows,30,'2026-01-05T00:00:00Z','2026-02-01T00:00:00Z'), [([], True)])

    def test_customer_and_anonymous_namespaces_do_not_collide(self):
        rows = [{'id':'1','anonymous_id':'same','occurred_at':'2026-01-01T00:00:00Z','type':'click','channel':'social'}, {'id':'2','customer_id':'same','occurred_at':'2026-01-02T00:00:00Z','type':'purchase','source':'server'}]
        self.assertEqual(paths_from_events(rows), [(['social'], False), ([], True)])

if __name__ == '__main__':
    unittest.main()
