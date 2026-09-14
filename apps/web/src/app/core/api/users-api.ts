import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import type { UserDto } from './dtos';
import { mapToUserProfile } from './mappers';
import type { UserProfile, UserProfileInput } from './models';
import { requestAsPromise } from './request';

/** Typed access to /users — backs the profile-session flow (ADR-005). */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  getAll(): Promise<UserProfile[]> {
    return requestAsPromise(
      this.http.get<UserDto[]>('/users').pipe(map((dtos) => dtos.map(mapToUserProfile))),
    );
  }

  getById(userId: number): Promise<UserProfile> {
    return requestAsPromise(this.http.get<UserDto>(`/users/${userId}`).pipe(map(mapToUserProfile)));
  }

  /** Backend answers 404 when no profile has this address (verified). */
  getByEmail(emailAddress: string): Promise<UserProfile> {
    return requestAsPromise(
      this.http
        .get<UserDto>(`/users/email/${encodeURIComponent(emailAddress)}`)
        .pipe(map(mapToUserProfile)),
    );
  }

  /** 409 when the address already belongs to another profile. */
  create(input: UserProfileInput): Promise<UserProfile> {
    return requestAsPromise(this.http.post<UserDto>('/users', input).pipe(map(mapToUserProfile)));
  }

  /**
   * Full-payload PUT: `updateUserSchema === createUserSchema`, so the backend
   * requires every field (verified — omitting emailAddress returns 400).
   */
  update(userId: number, input: UserProfileInput): Promise<UserProfile> {
    return requestAsPromise(
      this.http.put<UserDto>(`/users/${userId}`, input).pipe(map(mapToUserProfile)),
    );
  }

  async delete(userId: number): Promise<void> {
    await requestAsPromise(this.http.delete(`/users/${userId}`));
  }
}
