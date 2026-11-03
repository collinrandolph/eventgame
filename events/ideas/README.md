# Event ideas

100 event ideas, as data, for finding what recurs. They aren't events yet; nothing here is checked by the engine.

```
npm run ideas      # writes events/ideas/REPORT.md
```

## Format

Each `batch-NN.json` is an array of events:

| Field | What it is |
|---|---|
| `id`, `title`, `genre`, `premise` | The idea |
| `threat` | `kind`, `source` (where it comes from), `behavior` (how it moves and acts) |
| `setting` | `region`, `town` (town type), `scale`, `isolation`, `season`, `era` |
| `zones`, `sites` | Zone types and site types the setting needs |
| `cast` | Roles: `role`, `family`, `skills` |
| `story`, `endings` | Three beats, and the endings |
| `mechanics` | Engine systems the event leans on |
| `props`, `enemies`, `vehicles`, `fx` | What has to be built |

**Specific and base.** An entry written `specific:base` (`cement-mixer:heavy-truck`, `bigfoot:large-beast`) names
what the story wants and the general thing it could be built from. The report counts both, so it shows which bases
cover the most stories. An entry with no `:` is its own base.

Ids are kebab-case and reused across events on purpose, so counts mean something.
