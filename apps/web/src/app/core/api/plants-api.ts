import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import type { PlantDto } from './dtos';
import { visibleToParams } from './gardens-api';
import { mapToPlant } from './mappers';
import type { Plant, PlantInput } from './models';
import { requestAsPromise } from './request';

/**
 * Typed access to /plants — see GardensApi for the layering rules.
 *
 * `GET /plants/{plantId}` exists on the API but is deliberately not wrapped:
 * every field it returns is already in `GET /plants/garden/{gardenId}`, which
 * the detail screen loads anyway, so a per-plant round-trip on a 200–2000 ms
 * API would cost latency for no new information (API-INTEGRATION.md §3).
 */
@Injectable({ providedIn: 'root' })
export class PlantsApi {
  private readonly http = inject(HttpClient);

  /**
   * Every plant across all gardens in one request — what the gardens grid and
   * the dashboard use instead of one `getByGarden` per card. With `visibleTo`,
   * only the plants of that profile's gardens and the shared ones.
   */
  getAll(visibleTo?: number): Promise<Plant[]> {
    return requestAsPromise(
      this.http
        .get<PlantDto[]>('/plants', { params: visibleToParams(visibleTo) })
        .pipe(map((dtos) => dtos.map(mapToPlant))),
    );
  }

  getByGarden(gardenId: number): Promise<Plant[]> {
    return requestAsPromise(
      this.http
        .get<PlantDto[]>(`/plants/garden/${gardenId}`)
        .pipe(map((dtos) => dtos.map(mapToPlant))),
    );
  }

  create(input: PlantInput): Promise<Plant> {
    return requestAsPromise(this.http.post<PlantDto>('/plants', input).pipe(map(mapToPlant)));
  }

  /**
   * Full-payload PUT on purpose: the backend's update schema is an intersection
   * that effectively still requires every field (API-ANALYSIS gap #5).
   */
  update(plantId: number, input: PlantInput): Promise<Plant> {
    return requestAsPromise(
      this.http.put<PlantDto>(`/plants/${plantId}`, input).pipe(map(mapToPlant)),
    );
  }

  async delete(plantId: number): Promise<void> {
    await requestAsPromise(this.http.delete(`/plants/${plantId}`));
  }
}
