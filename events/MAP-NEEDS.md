# What the twenty events need from the map generator

Derived from [`SHORTLIST.md`](SHORTLIST.md). Each event's needs are listed as data in
[`map-needs.json`](map-needs.json): its layout, biome, region-and-era skin, scale, sites, layers above and below
ground, map layers that change during play, and edges.

## The headline: sites are a long tail, shells are not

The twenty events name **119 different site types**, and most appear in only one event: a fish plant, a zoo, an
assay office, a forge. Authoring 119 sites by hand is the trap. But they collapse into **13 building shells**, and
a site is a shell with a room program, fixtures and a yard:

| Shell | Events | Site types it covers | Examples |
|---|---|---|---|
| **Storefront** | 15 | 18 | Diner, bakery, pub, bar, café, pharmacy, bank, general store, post office, gas station (with a forecourt) |
| **Hall** | 14 | 9 | Church, temple, town hall, mess hall, lecture hall, stadium, arena, stage |
| **Dwelling** | 14 | 12 | House, cabin, hut, homestead, farmhouse, mansion, the mill lofts |
| **Transit** | 11 | 10 | Station, bus depot, ferry landing, quay, dock, airstrip, bridge, parking garage |
| **Block** | 10 | 9 | School, dorm, barracks, apartment block, hotel, motel, lab, detention center |
| **Shed** | 9 | 16 | Garage, hangar, fish plant, laundry, forge, stable, kennels, boatyard, mill, greenhouse, well house |
| **Industrial** | 8 | 9 | Mine head, port, reactor, logging site, substation, dam, water tower, comms station |
| **Special** | 8 | 6 | Police station, ranger station, château, bunker, tomb, ship |
| **Lot** | 7 | 10 | Dump, parking lot, midway, festival grounds, cemetery, pen, camp, zoo |
| **Perimeter** | 7 | 4 | Checkpoint, gate, the great wall, a base fence |
| **Ward** | 6 | 3 | Hospital, clinic, nursing home |
| **Big box** | 3 | 5 | Supermarket, department store, movie theater, convention center, aquarium |
| **Tower** | 1 | 7 | Lobby, hotel, apartment and office floors, vault, roof |

So the generator's library is shells, room programs and fixtures. A new site, such as the fish plant, is a short
card the AI writes: *shed shell; rooms: processing floor, cold store, office; fixtures: conveyor, ice chests, hoses;
yard: quay frontage*. Nothing new is drawn.

## Layouts: five skeletons

| Layout | Events | Shape |
|---|---|---|
| **Grid town** | 8 | Streets on a grid, blocks of lots: small town, college town, small city, city district. What Millbrook is now. |
| **Strip town** | 5 | A main street along a highway, an industrial site at one end, houses on large scattered lots, and wilderness as a large part of the map: the oil, mining, logging and outback towns, and the desert hamlet. Going up and down a strip isn't engaging on its own, so the wilderness carries the traversal and exploration: trails, the den, the mine, the ridge, the logging site. |
| **Village** | 3 | Organic streets around a church or square, with a waterfront or fields: the French village, the island villages. |
| **Compound** | 3 | A fence with a gate, buildings around open ground, nothing outside but terrain: the polar station, the desert base, the faire. |
| **Tower** | 1 | One building of many floors, with its street. |

Grid town and strip town cover 13 of the 20.

## Biomes and skins

- **Biomes** set the ground, plants, water and weather. Temperate covers 11 events, desert and outback 4, arctic 2,
  and northern coast, subtropical and jungle 1 each. Temperate and desert together cover 15.
- **Skins** set region and era: building materials, roof forms, facade parts, palettes, street furniture and
  vehicles. North America (modern, 1980s, near future, military, research) covers 16; East Asia, the 1930s Pacific,
  1940s France, northern Europe and the Australian outback are one each. A skin is a set of swaps on the same shells,
  so those four cost materials and palettes, not new buildings.

## Above and below

15 of the 20 events need a layer off the ground floor, and they're mostly the same few kinds:

- **Below:** cellars and basements (bar, pub, church), service tunnels and subways, labs and vaults, mine levels,
  caves and crypts. That's four generators: *a cellar under a shell*, *a tunnel network*, *a facility level*, and
  *a natural cave*.
- **Above:** rooftops (5 events: safe ground, sniping, escape), towers (church towers, the fire lookout, the mine
  headframe), and the full stack of floors in a tower. Rooftops need access (fire escapes, ladders, hatches) and a
  roof you can stand on, which the builder doesn't model yet.

## Map layers that change during play

The changes come down to five systems:

| System | Events | Covers |
|---|---|---|
| **Spread** | 7 | Infection, infestation, webbing, burrowing, fog, the claimed zones, the safe ground shrinking. One overlay that grows from sources along routes, drawn per event (webs, spores, fog, darkness). |
| **Fire** | 8 | Starts, spreads by material, burns out, leaves ruins. |
| **Light and dark** | 7 | Light sources, power, the polar night, the dark that hunts. |
| **Water level** | 4 | Flood, tide, the well's level, rain. One level per area that rises and falls. |
| **Movers** | 6 | Patrols, the crowd, the cordon, the giant's path. Routes on the map that the lives must cross. |

Weather (rain, snow, sand, wind) sits on top of all five as particles and visibility.

## Edges

What surrounds the map: city (5), highway (5), forest (4), desert (3), farmland (3), sea (3), then cliffs, rivers,
tundra, lake, jungle and canyon. An edge needs a way out (a road, a shore, a trail) and a reason it's closed (the
cordon, the storm, the drop, the wall).

## Tiles

What the art has to cover, grouped by what produces it:

| Group | Needed | Status |
|---|---|---|
| **Ground** by biome | Grass, dirt, mud, sand, rock, red earth, snow, ice, jungle floor, gravel, tilled fields | Grass, gravel, dirt partly |
| **Roads and paths** by skin | Asphalt with lane lines, gravel road, dirt track, cobbles, boardwalk and dock planks, sand track, ploughed snow road | Asphalt, sidewalk, alley |
| **Water** | River, lake, sea with shore, flood overlay, tide flats, frozen water | Water and bank partly |
| **Walls and roofs** by skin | Clapboard, brick, stone, concrete, corrugated metal, log, stucco, thatch, glass curtain wall; shingle, slate, metal, flat, thatch roofs | Brick, stucco, panel, siding; shingle, slate, flat, metal |
| **Interiors** by shell | Floor and wall kits for the 13 shells: storefront, hall, ward, block corridors and rooms, shed, big-box aisles, cellars and caves | Several floor themes |
| **Fixtures** by room | Counters, shelves, pews, beds, desks, ovens, bars, vault doors, machines, cages | A few props |
| **Dynamic overlays** | Spread (webs, spores, fog, dark), fire and ruins, water level, snow drifts | None |

## What this means for the generator

The pipeline from [`CONTRACT.md`](../CONTRACT.md) §5.2 gets concrete:

1. **Layout skeleton** (one of five) lays out streets, blocks or compound ground, and the edges.
2. **Required sites first.** The event's holds, expeditions and every life's errand destination are placed, each as a
   shell, room program, fixtures and yard.
3. **Collision check.** This is new, and it comes straight from the stories. The threat's sources and movers are
   placed so that **every life's route from its start to its errand crosses the threat**. The generator checks
   this the way the engine already proves a life completable: if an errand can be done without meeting the threat,
   the layout moves the errand, the source or the route until it can't.
4. **Fill** the rest of the town with ordinary shells for the layout and skin.
5. **Layers above and below:** cellars, tunnels, facility levels, caves; rooftops and their access.
6. **Dynamic layers:** spread, fire, light, water level and movers, with their sources from the event.
7. **Dress and render** with the biome and skin.

## Decided

- **North American design only, for now.** The other skins wait.
- **Shells before towns.** The first piece is five shells (storefront, hall, dwelling, block, ward) on lots with
  plain lawns: one block in the playable view.
- **Strip towns lean on wilderness** for traversal and exploration (above).

## Where to start (before the decisions above)

Grid town (what we have) plus strip town covers 13 events. Storefront, hall, dwelling, block and ward shells cover
the holds and errands of nearly all of them. Fire, the spread overlay and the light system each serve 7 or 8 events.
The collision check is the piece no existing tool has, and the one most tied to how this game plays.
