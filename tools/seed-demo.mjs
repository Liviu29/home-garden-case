#!/usr/bin/env node
/**
 * Demo data for HomeGarden, in one command.
 *
 *   npm run dev          # in one terminal: the API must be running
 *   npm run seed         # adds the demo profiles and gardens (safe to re-run)
 *   npm run seed:reset   # removes the demo data first, then adds it again
 *
 * What it creates: three profiles (Liviu, Maya, Tom) and eleven gardens that
 * each show something — a full garden, a humidity drift, a garden planted over
 * months for the timeline, an empty bed — owned by those profiles, plus one
 * shared allotment every profile sees (ADR-009).
 *
 * It only ever touches its own data: the reset removes the demo profiles, the
 * gardens they own and the demo gardens by name, never anything else. It goes
 * through the public API, so the API's rules apply, and it retries the 500s
 * the API throws on purpose. Point it elsewhere with SEED_API=http://host:port.
 */

const BASE = process.env.SEED_API ?? 'http://localhost:3000';
const RESET = process.argv.includes('--reset');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, body) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    let response;
    try {
      response = await fetch(BASE + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(`Cannot reach the API at ${BASE}. Start it first: npm run dev`);
    }
    if (response.ok) {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
    if (response.status >= 500) {
      await sleep(250 * attempt); // the API fails 10% of requests on purpose
      continue;
    }
    const error = new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
    error.status = response.status;
    throw error;
  }
  throw new Error(`${method} ${path} kept failing with 5xx`);
}

const day = (date) => `${date}T08:00:00.000Z`;
const plant = (plantName, species, plantType, surfaceAreaRequired, idealHumidityLevel, date) => ({
  plantName,
  species,
  plantType,
  surfaceAreaRequired,
  idealHumidityLevel,
  plantationDate: day(date),
});

const PROFILES = {
  liviu: { emailAddress: 'liviu@homegarden.demo', firstName: 'Liviu', lastName: 'Nita', age: null },
  maya: { emailAddress: 'maya@homegarden.demo', firstName: 'Maya', lastName: 'Lin', age: 29 },
  tom: { emailAddress: 'tom@homegarden.demo', firstName: 'Tom', lastName: 'Peeters', age: 41 },
};

/** owner: a PROFILES key, or null for a garden shared with every profile. */
const GARDENS = [
  {
    owner: 'liviu',
    garden: {
      gardenName: 'Heritage Orchard',
      totalSurfaceArea: 120,
      targetHumidityLevel: 55,
      locationDescription: 'Family orchard · Sibiu countryside',
      latitude: 45.7983,
      longitude: 24.1256,
    },
    plants: [
      plant("Apple Tree 'Jonagold'", 'Malus domestica', 'fruit', 12, 55, '2025-11-15'),
      plant("Pear Tree 'Conference'", 'Pyrus communis', 'fruit', 10, 55, '2025-11-15'),
      plant("Sweet Cherry Tree 'Stella'", 'Prunus avium', 'fruit', 14, 55, '2025-11-29'),
      plant("Plum Tree 'Victoria'", 'Prunus domestica', 'fruit', 10, 55, '2026-03-07'),
      plant('Raspberry Canes', 'Rubus idaeus', 'fruit', 6, 60, '2026-03-21'),
      plant('Highbush Blueberry', 'Vaccinium corymbosum', 'fruit', 4, 65, '2026-04-04'),
      plant('Wildflower Meadow Strip', 'Papaver rhoeas', 'flower', 8, 50, '2026-04-18'),
    ],
  },
  {
    owner: 'maya',
    garden: {
      gardenName: 'Tropical Greenhouse',
      totalSurfaceArea: 18,
      targetHumidityLevel: 85,
      locationDescription: 'Heated glasshouse · Ghent',
      latitude: 51.0543,
      longitude: 3.7174,
    },
    plants: [
      plant('Banana Palm', "Musa acuminata 'Dwarf Cavendish'", 'fruit', 4, 85, '2026-02-10'),
      plant('Boston Fern', 'Nephrolepis exaltata', 'flower', 1.5, 88, '2026-02-10'),
      plant('Moth Orchid Shelf', 'Phalaenopsis amabilis', 'flower', 0.8, 80, '2026-03-01'),
      plant('Bird of Paradise', 'Strelitzia reginae', 'flower', 2.5, 75, '2026-03-15'),
      plant('Ginger', 'Zingiber officinale', 'vegetable', 1.2, 85, '2026-04-01'),
      plant('Papaya Tree', 'Carica papaya', 'fruit', 4.5, 80, '2026-04-20'),
      plant('Vanilla Vine', 'Vanilla planifolia', 'flower', 1.8, 90, '2026-05-12'),
    ],
  },
  {
    owner: 'liviu',
    garden: {
      gardenName: 'Back Garden Vegetable Patch',
      totalSurfaceArea: 25,
      targetHumidityLevel: 60,
      locationDescription: 'Back garden · Antwerp, Berchem',
      latitude: 51.1994,
      longitude: 4.4318,
    },
    plants: [
      plant('Butterhead Lettuce', 'Lactuca sativa', 'vegetable', 0.9, 70, '2026-03-28'),
      plant("Carrot 'Nantes'", 'Daucus carota', 'vegetable', 1.2, 55, '2026-03-28'),
      plant('Strawberry Patch', 'Fragaria × ananassa', 'fruit', 2, 60, '2026-04-11'),
      plant("Tomato 'San Marzano'", 'Solanum lycopersicum', 'vegetable', 2.4, 65, '2026-04-25'),
      plant(
        "Cherry Tomato 'Sungold'",
        'Solanum lycopersicum var. cerasiforme',
        'vegetable',
        1.2,
        65,
        '2026-04-25',
      ),
      plant("Zucchini 'Black Beauty'", 'Cucurbita pepo', 'vegetable', 3, 62, '2026-05-09'),
      plant('Bell Pepper', 'Capsicum annuum', 'vegetable', 1, 60, '2026-05-09'),
      plant('Sweet Basil', 'Ocimum basilicum', 'vegetable', 0.6, 60, '2026-05-23'),
      plant("Cucumber 'Marketmore'", 'Cucumis sativus', 'vegetable', 2, 70, '2026-05-23'),
      plant('Dwarf French Beans', 'Phaseolus vulgaris', 'vegetable', 1.5, 60, '2026-06-06'),
    ],
  },
  {
    owner: 'maya',
    garden: {
      gardenName: 'Shade & Fern Woodland',
      totalSurfaceArea: 14,
      targetHumidityLevel: 75,
      locationDescription: 'North border under the old beech · Brașov',
      latitude: 45.6427,
      longitude: 25.5887,
    },
    plants: [
      plant('Male Fern', 'Dryopteris filix-mas', 'flower', 1.5, 78, '2026-03-07'),
      plant("Hosta 'Frances Williams'", 'Hosta sieboldiana', 'flower', 1.6, 68, '2026-03-07'),
      plant('Wild Garlic', 'Allium ursinum', 'vegetable', 1.2, 80, '2026-03-21'),
      plant('Mophead Hydrangea', 'Hydrangea macrophylla', 'flower', 2.5, 72, '2026-04-02'),
      plant("Astilbe 'Fanal'", 'Astilbe × arendsii', 'flower', 1, 76, '2026-04-02'),
      plant('Lily of the Valley', 'Convallaria majalis', 'flower', 0.8, 74, '2026-04-16'),
      plant('Moss & Fern Carpet', 'Polystichum setiferum', 'flower', 1.4, 85, '2026-05-01'),
    ],
  },
  {
    owner: 'liviu',
    garden: {
      gardenName: 'Rooftop Pollinator Border',
      totalSurfaceArea: 10,
      targetHumidityLevel: 50,
      locationDescription: 'Rooftop planters · Bucharest',
      latitude: 44.4268,
      longitude: 26.1025,
    },
    plants: [
      plant("English Rose 'Gertrude Jekyll'", 'Rosa × hybrida', 'flower', 2, 55, '2026-03-20'),
      plant("Lavender 'Munstead'", 'Lavandula angustifolia', 'flower', 2.5, 45, '2026-04-10'),
      plant('Purple Coneflower', 'Echinacea purpurea', 'flower', 1.5, 50, '2026-04-10'),
      plant('Giant Sunflower', 'Helianthus annuus', 'flower', 2, 55, '2026-05-01'),
      plant('Catmint', 'Nepeta × faassenii', 'flower', 2, 45, '2026-05-15'),
    ],
  },
  {
    owner: null,
    garden: {
      gardenName: 'Community Allotment Plot 14',
      totalSurfaceArea: 20,
      targetHumidityLevel: 55,
      locationDescription: 'Shared allotment, plot 14 · Ghent, Bijloke',
      latitude: 51.0469,
      longitude: 3.7112,
    },
    plants: [
      plant('Raspberry Canes', 'Rubus idaeus', 'fruit', 2.5, 60, '2026-03-20'),
      plant('Barrel Cactus', 'Echinocactus grusonii', 'flower', 1.2, 15, '2026-04-03'),
      plant('Aloe Vera', 'Aloe barbadensis', 'flower', 1, 25, '2026-04-03'),
      plant("Cucumber 'La Diva'", 'Cucumis sativus', 'vegetable', 2, 75, '2026-04-17'),
      plant('Spearmint', 'Mentha spicata', 'vegetable', 0.8, 72, '2026-05-01'),
      plant('Romaine Lettuce', 'Lactuca sativa var. longifolia', 'vegetable', 1, 70, '2026-05-01'),
      plant('Rosemary', 'Salvia rosmarinus', 'vegetable', 1, 38, '2026-05-15'),
      plant("Pumpkin 'Atlantic Giant'", 'Cucurbita maxima', 'vegetable', 3.5, 65, '2026-05-29'),
    ],
  },
  {
    owner: 'maya',
    garden: {
      gardenName: 'Mediterranean Herb Terrace',
      totalSurfaceArea: 12,
      targetHumidityLevel: 40,
      locationDescription: 'South-facing terrace · Cluj-Napoca',
      latitude: 46.7712,
      longitude: 23.6236,
    },
    plants: [
      plant("Rosemary 'Tuscan Blue'", 'Salvia rosmarinus', 'vegetable', 1.2, 40, '2026-03-21'),
      plant("Lavender 'Hidcote'", 'Lavandula angustifolia', 'flower', 2, 42, '2026-04-04'),
      plant('Creeping Thyme', 'Thymus serpyllum', 'vegetable', 0.8, 38, '2026-04-04'),
      plant('Garden Sage', 'Salvia officinalis', 'vegetable', 1, 45, '2026-04-18'),
      plant('Greek Oregano', 'Origanum vulgare subsp. hirtum', 'vegetable', 0.6, 42, '2026-05-02'),
      plant('Echeveria Rosette Bed', 'Echeveria elegans', 'flower', 0.8, 30, '2026-05-16'),
    ],
  },
  {
    owner: 'liviu',
    garden: {
      gardenName: 'City Balcony Jungle',
      totalSurfaceArea: 6,
      targetHumidityLevel: 35,
      locationDescription: '7th-floor balcony · Cluj-Napoca',
    },
    plants: [
      plant('Boston Fern', 'Nephrolepis exaltata', 'flower', 0.8, 80, '2026-06-01'),
      plant('Peace Lily', 'Spathiphyllum wallisii', 'flower', 0.6, 75, '2026-06-01'),
      plant("Calathea 'Medallion'", 'Goeppertia veitchiana', 'flower', 0.5, 80, '2026-06-15'),
      plant('Mint in a Trough', 'Mentha spicata', 'vegetable', 0.4, 70, '2026-06-15'),
    ],
  },
  {
    owner: 'tom',
    garden: {
      gardenName: 'Front Yard Rock Garden',
      totalSurfaceArea: 15,
      targetHumidityLevel: 65,
      locationDescription: 'Gravel front yard · Antwerp',
      latitude: 51.2194,
      longitude: 4.4025,
    },
    plants: [
      plant('Blue Agave', 'Agave tequilana', 'flower', 2, 20, '2026-05-05'),
      plant(
        "Echeveria 'Perle von Nürnberg'",
        'Echeveria gibbiflora',
        'flower',
        1,
        30,
        '2026-05-05',
      ),
      plant('Stonecrop Carpet', 'Sedum acre', 'flower', 1.5, 30, '2026-05-19'),
      plant('Aloe Vera', 'Aloe barbadensis', 'flower', 0.8, 25, '2026-05-19'),
      plant('Golden Barrel Cactus', 'Echinocactus grusonii', 'flower', 1, 15, '2026-06-02'),
    ],
  },
  {
    owner: 'liviu',
    garden: {
      gardenName: 'Kitchen Herb Spiral',
      totalSurfaceArea: 5,
      targetHumidityLevel: 60,
      locationDescription: 'Herb spiral by the kitchen door · Ghent',
    },
    plants: [
      plant('Chives', 'Allium schoenoprasum', 'vegetable', 0.5, 60, '2026-03-14'),
      plant('Flat-leaf Parsley', 'Petroselinum crispum', 'vegetable', 0.6, 62, '2026-03-28'),
      plant('Lemon Thyme', 'Thymus citriodorus', 'vegetable', 1, 45, '2026-04-11'),
      plant('Genovese Basil', 'Ocimum basilicum', 'vegetable', 0.8, 60, '2026-05-09'),
      plant('Coriander', 'Coriandrum sativum', 'vegetable', 0.6, 58, '2026-05-09'),
      plant('Dill', 'Anethum graveolens', 'vegetable', 0.7, 55, '2026-05-23'),
      plant('Moroccan Mint', 'Mentha spicata var. crispa', 'vegetable', 0.7, 70, '2026-06-06'),
    ],
  },
  {
    owner: 'tom',
    garden: {
      gardenName: 'New Raised Bed',
      totalSurfaceArea: 8,
      targetHumidityLevel: 60,
      locationDescription: 'Fresh cedar bed, waiting for spring',
    },
    plants: [],
  },
];

const DEMO_NAMES = new Set(GARDENS.map((g) => g.garden.gardenName));

/** The demo profiles, created when missing: { liviu: 12, … }. */
async function ensureProfiles() {
  const ids = {};
  for (const [key, profile] of Object.entries(PROFILES)) {
    try {
      ids[key] = (await call('POST', '/users', profile)).userId;
      console.log(`  + profile ${profile.firstName} ${profile.lastName}`);
    } catch (error) {
      if (error.status !== 409) throw error;
      ids[key] = (
        await call('GET', `/users/email/${encodeURIComponent(profile.emailAddress)}`)
      ).userId;
      console.log(`  = profile ${profile.firstName} ${profile.lastName} (already there)`);
    }
  }
  return ids;
}

/** Removes the demo gardens (their plants go with them) and the demo profiles. */
async function removeDemo() {
  const gardens = await call('GET', '/gardens');
  for (const garden of gardens.filter((g) => DEMO_NAMES.has(g.gardenName))) {
    await call('DELETE', `/gardens/${garden.gardenId}`);
    console.log(`  - garden ${garden.gardenName}`);
  }
  for (const profile of Object.values(PROFILES)) {
    try {
      const existing = await call(
        'GET',
        `/users/email/${encodeURIComponent(profile.emailAddress)}`,
      );
      await call('DELETE', `/users/${existing.userId}`);
      console.log(`  - profile ${profile.firstName} ${profile.lastName}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
}

async function main() {
  console.log(`HomeGarden demo data → ${BASE}`);
  if (RESET) {
    console.log('Removing the previous demo data:');
    await removeDemo();
  }

  console.log('Profiles:');
  const ids = await ensureProfiles();

  console.log('Gardens:');
  const existing = new Set((await call('GET', '/gardens')).map((g) => g.gardenName));
  for (const { owner, garden, plants } of GARDENS) {
    if (existing.has(garden.gardenName)) {
      console.log(`  = ${garden.gardenName} (already there)`);
      continue;
    }
    const userId = owner === null ? null : ids[owner];
    const created = await call('POST', '/gardens', { ...garden, userId });
    for (const p of plants) {
      await call('POST', '/plants', { ...p, gardenId: created.gardenId });
    }
    const who = owner === null ? 'shared' : PROFILES[owner].firstName;
    console.log(`  + ${garden.gardenName} — ${plants.length} plants, ${who}`);
  }

  console.log('\nDone. Open http://localhost:4200 and pick Liviu, Maya or Tom.');
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error.message}`);
  process.exit(1);
});
