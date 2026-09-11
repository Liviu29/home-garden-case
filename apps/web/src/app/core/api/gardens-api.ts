import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GardenDto } from './dtos';
import { mapToGarden } from './mappers';
import { Garden, GardenInput } from './models';
import { requestAsPromise } from './request';

/** `?visibleTo=<userId>` when a profile is given; no filter otherwise. */
export const visibleToParams = (visibleTo?: number): HttpParams =>
  visibleTo === undefined ? new HttpParams() : new HttpParams().set('visibleTo', visibleTo);

/**
 * Typed access to /gardens. Thin by design: mapping + promise bridging only.
 * Resilience (retry/cache) lives in interceptors and QueryCache — never here.
 */
@Injectable({ providedIn: 'root' })
export class GardensApi {
  private readonly http = inject(HttpClient);

  /** With `visibleTo`: that profile's gardens plus the shared ones (ADR-009). */
  getAll(visibleTo?: number): Promise<Garden[]> {
    return requestAsPromise(
      this.http
        .get<GardenDto[]>('/gardens', { params: visibleToParams(visibleTo) })
        .pipe(map((dtos) => dtos.map(mapToGarden))),
    );
  }

  getById(gardenId: number): Promise<Garden> {
    return requestAsPromise(
      this.http.get<GardenDto>(`/gardens/${gardenId}`).pipe(map(mapToGarden)),
    );
  }

  /** `ownerId` makes the new garden that profile's; without it the garden is shared. */
  create(input: GardenInput, ownerId?: number): Promise<Garden> {
    const body = ownerId === undefined ? input : { ...input, userId: ownerId };
    return requestAsPromise(this.http.post<GardenDto>('/gardens', body).pipe(map(mapToGarden)));
  }

  /** The owner is not sent, so an edit never changes who owns the garden. */
  update(gardenId: number, input: GardenInput): Promise<Garden> {
    return requestAsPromise(
      this.http.put<GardenDto>(`/gardens/${gardenId}`, input).pipe(map(mapToGarden)),
    );
  }

  async delete(gardenId: number): Promise<void> {
    await requestAsPromise(this.http.delete(`/gardens/${gardenId}`));
  }
}
