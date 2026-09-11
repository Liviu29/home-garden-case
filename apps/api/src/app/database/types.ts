import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Database {
  user: UserTable;
  garden: GardenTable;
  plant: PlantTable;
}

export interface UserTable {
  userId: Generated<number>;
  firstName: string | null;
  lastName: string | null;
  age: number | null;
  emailAddress: string;
  createdAt: ColumnType<Date, string | undefined, never>;
  updatedAt: ColumnType<Date, string | undefined, never>;
}

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;

export interface GardenTable {
  gardenId: Generated<number>;
  gardenName: string;
  totalSurfaceArea: number; // in square meters
  locationDescription: string | null; // e.g., "Backyard", "Patio"
  targetHumidityLevel: Generated<number>; // configurable target humidity (0-100)
  latitude: number | null; // optional geographic coordinate
  longitude: number | null; // optional geographic coordinate
  userId: number | null; // owning profile; null = shared with every profile
  createdAt: ColumnType<Date, string | undefined, never>;
  updatedAt: ColumnType<Date, string | undefined, never>;
}

export type Garden = Selectable<GardenTable>;
export type NewGarden = Insertable<GardenTable>;
export type GardenUpdate = Updateable<GardenTable>;

export interface PlantTable {
  plantId: Generated<number>;
  plantName: string;
  species: string;
  plantType: 'vegetable' | 'fruit' | 'flower';
  plantationDate: ColumnType<Date, string | undefined, never>;
  surfaceAreaRequired: number; // in square meters
  idealHumidityLevel: number;
  gardenId: number; // foreign key to Garden
  createdAt: ColumnType<Date, string | undefined, never>;
  updatedAt: ColumnType<Date, string | undefined, never>;
}

export type Plant = Selectable<PlantTable>;
export type NewPlant = Insertable<PlantTable>;
export type PlantUpdate = Updateable<PlantTable>;
