# Environment sprites

Tiles, textures, themes and props for the **3/4 top-down**, **flat 8-bit** maps, in the same palette-key format as
the characters (one JSON file per sprite, `.` empty, rows joined with `/`). One 2 m grid cell is one **16×16** tile.

```
npm run env -- worlds/ash-river.json
```

writes to `sprites/maps/`:

| File | What it is |
|---|---|
| `<world>-L0-exterior.png` | The ground floor from the street: every building roofed |
| `<world>-L0-interior.png` | The same with every roof lifted (floors, thin walls, people inside) |
| `<world>-L<z>.png` | Other floors (only ever seen from inside) |
| `<world>.map.json` | What the game reads, per layer: cell kinds and floor looks, the **building grid** (which roof to lift when the player is inside), roof lots, props with their state, people, road lines and crosswalks |

All art in `data/` is **placeholder**, drawn by the scripts in `placeholder/` (run the four in order with
`sprites/env/data` as the argument).

**Scale:** 8 px per metre. A 2 m cell is 16 px, a 16 px character is about 1.9 m, a storey is 3 m (24 px), a door
is 0.9 × 2.1 m, a car 4.5 m, a street lamp or tree 5.5 m. Draw new pieces at that scale.

**Generated cities** (`npm run city -- cities/<id>.json`, see `src/city/generate.ts`) also write these to the world
config:
- `areas`: open ground drawn over sidewalk cells. Kinds: park, path, lawn, yard, plaza, entry, parking (with
  painted stalls), driveway, median, apron.
- `features`: decos standing at cells, drawn north to south so nearer ones overlap farther ones.
- `parcels`: lots exactly as laid out, with an optional fire escape on their south face. Redraw any file in the sprite editor and keep its id and palette keys; the
builder picks it up.

## Rules (`src/env/build.ts`)

- **8-bit.** Every colour comes from one master palette (`palette-street.json`, NES-inspired), and every texture
  uses at most 4 of them. Fills are flat: no gradients or noise ramps. Patterns are placed deliberately (joints,
  seams, shingle tabs, tufts, waves), and outlines are black, matching the characters. A test enforces both rules.
- **3/4 view.** A structure is a roof slab over a front wall, and only south faces are drawn.
  - The roof covers the north part of the footprint, and the front wall rises from the south edge, `WALL` (20 px)
    per storey. Enterable buildings get two storeys when they have an upper floor; unenterable lots get one to
    four.
  - A black eave line separates roof and wall. Walls carry a window rhythm per storey, and the ground floor of an
    enterable building shows its doors in their current state.
  - Small buildings get gable roofs: a lighter back slope, a ridge line, then the front slope. Big ones get flat
    roofs with a parapet whose inner face shows on the north side.
  - When structures abut, the one behind shows only the part of its wall that rises above the one in front.
  - The raised sidewalk shows a 2 px curb face on the road below it. The river bank shows its stone face below the
    land to the north.
- **Buildings.** Each enterable building is one roof object: its walls, the doors in them, and the indoor floor
  they enclose. The game lifts that roof while the player is inside, and the rest of the map stays drawn. Walls
  around open ground, like a fenced compound, get no roof (the `outdoor` list in the world config).
- **Thin walls.** A wall is a whole cell in the grid but is drawn as a 4 px line on the cell's outer edge, with the
  floor filling the rest. North walls show their inside face.
- **Streets.**
  - Sidewalks are real grid cells (`streets.sidewalk`). They're walkable, and they're part of the street zone they
    border, so the engine and the game agree on where you can walk. The road is exactly the named street
    rectangles.
  - Sidewalk corners that face road on both sides are rounded: a quarter circle is carved per cell quadrant, the
    same idea as dual-grid autotiling.
  - Each street rectangle gets a double yellow centre line down its own axis (none on one-lane streets), and a
    crosswalk on each side of every intersection.
  - Lamps stand along the curbs, trees line residential streets, and there's the odd hydrant. Doorways are kept
    clear.
- **Archetypes** (`archetypes.json`). A building type describes:
  - its roof form and materials, and its wall material;
  - its storeys;
  - facade modules per storey: window, ground floor, shop doors or loading doors, awnings;
  - its entrance: door module and canopy;
  - its features: roof features, a tower, wall features like a clock, and things in front like a parked
    ambulance.

  The world config maps each enterable building's zone to a type. Ash River's ten landmarks each have their own.
  Features on a front that faces another building are left off.
- **Districts.** The world config draws district rectangles, and unenterable lots pick their archetype from their
  district:
  - downtown: shops and offices;
  - residential: houses, rowhouses and yards;
  - industrial: warehouses and sawtooth factories.

  Blocks are split into lots of at most about 12 cells.

## data/

| Kind | Files |
|---|---|
| texture (`tex-*`) | Ground: asphalt, sidewalk, plaza squares, concrete, grass, gravel, water, bank face. Roofs: shingle and slate (front and back slopes), flat, flat light, metal. Walls: brick, stucco, panel, siding |
| tile (`tile-*`) | Interior floor patterns, wall top and inside face, stairs, ladder, manhole |
| theme (`theme-*`) | A floor tile (`floor`), an outdoor texture (`texture`), and colours for the floor and walls |
| prop (`prop-*`) | One frame per engine state: door, gate, fence, barricade, hatch |
| deco (`deco-*`) | Windows and doors (closed, locked, open) for front walls; rooftop clutter |
| palette (`palette-street`) | The master palette, plus curb, curb face, eave, lane paint and parapet colours |

## Imported packs and skins

Third-party sheets come in through a manifest per pack (`sprites/import/<pack>.json`). A manifest gives the source
image, its grid, its licence, and the pieces to cut, each as a cell, a block of cells or a pixel rectangle, with
optional trimming to the visible pixels.

```
npm run import-tiles -- sprites/import/kenney.json --sheet   # numbered contact sheet, for picking cells
npm run import-tiles -- sprites/import/kenney.json           # cut the pieces into sprites/env/imported/kenney/
npm run env -- worlds/millbrook.json --skin=kenney           # draw with them: millbrook-L0-exterior-kenney.png
```

- Imported pieces keep their pack's own colours (`"palette": "keep"`), or snap to our master palette
  (`"snap"`). Each records its source and licence.
- A skin (`sprites/env/skins/<name>.json`) maps our piece ids to imported ones, so a whole kit swaps in without
  touching the builder.

| Pack | Licence | In the repo |
|---|---|---|
| Kenney RPG Urban Pack (`vendor/kenney-rpg-urban/`) | CC0 | Yes |
| Lo Bit City by Greywyrd (`vendor/lo-bit-city/`) | Commercial use and edits allowed; no redistribution; credit Greywyrd | **No:** the sheet and its cut pieces are git-ignored. Download it from https://greywyrd.itch.io/lo-bit-city into `vendor/lo-bit-city/`. |

## worlds/

`<world>.json` holds:
- `zones`: each zone's theme.
- `outdoor`: walled zones open to the sky.
- `barriers`: barrier → prop (a door when not listed).
- `people`: person → character recipe.

## Not yet

- **Street width:** Ash River's streets are 2–3 cells (4–6 m), so lanes are narrow. Generated cities should use
  wider streets.
- **Signs:** no lettering yet; the pixel font is paused.
- **Hidden fronts:** a building's front wall is hidden when a taller building stands directly south of it. Doors in
  east and west walls can't be seen from outside.
- **Not drawn yet:** items, vehicles and machines.
- **No damage or decay states yet.**
