/**
 * Du'as that may follow the abuse safety block (WO#385, Gem 3 ruling,
 * 25 Sep 2026).
 *
 * EMPTY in 1.4.1: an abuse input returns the safety block and resources
 * ONLY. A record id is added here only on a Gem 3 + Gem 4 ruling; the
 * report-only candidate list is in docs/wo385-sg-report.md section 9.
 *
 * Whatever is listed, a sabr/endurance du'a is never returned on an abuse
 * input: selectAbuseSafeDuas() drops any record isEnduranceDua() flags, even
 * if it is on this list.
 */
export const ABUSE_SAFE_DUAS: readonly string[] = []
