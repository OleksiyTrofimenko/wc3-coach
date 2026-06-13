# Entity icons

Game-entity icons are resolved by **convention** (no DB column):

```
/icons/<kind>/<key>.png
```

where `<kind>` is the entity-ref kind and `<key>` is its canonical ontology slug
(the same `key` used throughout the system). Examples:

```
public/icons/hero/far_seer.png
public/icons/hero/tauren_chieftain.png
public/icons/unit/peon.png
public/icons/building/altar_of_storms.png
public/icons/upgrade/forged_swords.png
public/icons/ability/chain_lightning.png
```

## Adding icons

Drop a PNG named by the entity's `key` into the matching `<kind>/` folder. It will
appear automatically wherever that entity is rendered (build-order timeline, coach
report hero row, etc.) — no code change, no rebuild config needed.

Until a PNG exists for an entity, the UI shows a **kind-colored placeholder tile**
with the entity's initials, so everything works with zero art (Principle #2:
everything local — no network icon dependency).

WC3's own icons ship as `.blp` inside the game's CASC storage; convert the ones you
want to PNG and name them by `key`. Square images (e.g. 64×64) look best.

The entity `key` values come from the ontology seed
(`packages/db/src/seed/ontology.*.json`) and the resolved `entity_ref` strings in
the timeline (`<kind>:<key>`).
