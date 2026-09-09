import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { UserDto } from './dtos';
import { mapToUserProfile } from './mappers';
import { UserProfile, UserProfileInput } from './models';
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

  create(input: UserProfileInput): Promise<UserProfile> {
    return requestAsPromise(this.http.post<UserDto>('/users', input).pipe(map(mapToUserProfile)));
  }
}
