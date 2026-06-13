"""Unit tests for observation extraction (pure, no DB)."""

from __future__ import annotations

from app.benchmarks.models import PlayerInfo, TimelineEvent
from app.refdata.extract import AGGREGATABLE_METRICS, observations_for

ORC = PlayerInfo(
    slot=1, race_id="race:orc", player_name="ProOrc", apm=300.0, result="win"
)
NE = PlayerInfo(
    slot=2, race_id="race:nightelf", player_name="ProNE", apm=290.0, result="loss"
)


def _ev(slot: int, t_ms: int, etype: str, ref: str, payload: dict | None = None):
    return TimelineEvent(
        t_ms=t_ms, event_type=etype, entity_ref=ref, slot=slot, payload=payload or {}
    )


def test_extract_keys_observations_by_perspective() -> None:
    events = [
        _ev(1, 62_000, "hero_level", "hero:far_seer", {"level": 1}),
        _ev(2, 70_000, "hero_level", "hero:demon_hunter", {"level": 1}),
    ]
    obs = observations_for(events, [ORC, NE], game_duration_ms=300_000)

    # Orc's first hero -> OvNE/orc; NE's -> NEvO/nightelf
    orc_fh = [o for o in obs if o.metric == "first_hero_timing" and o.race_id == "orc"]
    ne_fh = [
        o for o in obs if o.metric == "first_hero_timing" and o.race_id == "nightelf"
    ]
    assert len(orc_fh) == 1
    assert orc_fh[0].matchup == "OvNE"
    assert orc_fh[0].value == 62_000.0
    assert orc_fh[0].player_name == "ProOrc"
    assert len(ne_fh) == 1
    assert ne_fh[0].matchup == "NEvO"
    assert ne_fh[0].value == 70_000.0


def test_extract_excludes_absent_sentinel_values() -> None:
    # No T2/expansion/hero-level-3 events -> those metrics produce value=-1
    events = [_ev(1, 62_000, "hero_level", "hero:far_seer", {"level": 1})]
    obs = observations_for(events, [ORC, NE], game_duration_ms=300_000)
    # No observation should carry the -1 sentinel
    assert all(o.value >= 0 for o in obs)
    # tier2_timing was absent for both -> not present
    assert not any(o.metric == "tier2_timing" for o in obs)


def test_extract_only_aggregatable_metrics() -> None:
    events = [_ev(1, 62_000, "hero_level", "hero:far_seer", {"level": 1})]
    obs = observations_for(events, [ORC, NE], game_duration_ms=300_000)
    assert all(o.metric in AGGREGATABLE_METRICS for o in obs)
    # idle-gap / supply-block / worker_count are NOT aggregatable references
    assert not any("gap" in o.metric or "supply" in o.metric for o in obs)
