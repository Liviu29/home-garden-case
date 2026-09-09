import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { PlantDto } from './dtos';
import { mapToPlant } from './mappers';
import { Plant, PlantInput } from './models';
import { requestAsPromise } from './request';

/** Typed access to /plants — see GardensApi for the layering rules. */
@Injectable({ providedIn: 'root' })
export class PlantsApi {
  private readonly http = inject(HttpClient);

  getById(plantId: number): Promise<Plant> {
    return requestAsPromise(this.http.get<PlantDto>(`/plants/${plantId}`).pipe(map(mapToPlant)));
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
