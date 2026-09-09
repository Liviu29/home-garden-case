import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GardenDto } from './dtos';
import { mapToGarden } from './mappers';
import { Garden, GardenInput } from './models';
import { requestAsPromise } from './request';

/**
 * Typed access to /gardens. Thin by design: mapping + promise bridging only.
 * Resilience (retry/cache) lives in interceptors and QueryCache — never here.
 */
@Injectable({ providedIn: 'root' })
export class GardensApi {
  private readonly http = inject(HttpClient);

  getAll(): Promise<Garden[]> {
    return requestAsPromise(
      this.http.get<GardenDto[]>('/gardens').pipe(map((dtos) => dtos.map(mapToGarden))),
    );
  }

  getById(gardenId: number): Promise<Garden> {
    return requestAsPromise(
      this.http.get<GardenDto>(`/gardens/${gardenId}`).pipe(map(mapToGarden)),
    );
  }

  create(input: GardenInput): Promise<Garden> {
    return requestAsPromise(this.http.post<GardenDto>('/gardens', input).pipe(map(mapToGarden)));
  }

  update(gardenId: number, input: GardenInput): Promise<Garden> {
    return requestAsPromise(
      this.http.put<GardenDto>(`/gardens/${gardenId}`, input).pipe(map(mapToGarden)),
    );
  }

  async delete(gardenId: number): Promise<void> {
    await requestAsPromise(this.http.delete(`/gardens/${gardenId}`));
  }
}
