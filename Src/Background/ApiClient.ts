import { SiteOrigin } from '../Shared/Settings';
import type {
	ApiLookupResponse,
	ApiReportResponse,
	ApiSubmitResponse,
	ApiUser,
	ApiUserDetail,
	SubmitStatus
} from '../Shared/ApiTypes';

const MaxLookupIds = 100;
const MaxReportIds = 200;
const TimeoutMs = 10_000;

export class ApiError extends Error {
	constructor(
		readonly Status: number,
		Message: string
	) {
		super(Message);
		this.name = 'ApiError';
	}
}

export class ApiClient {
	private readonly BaseUrl = `${SiteOrigin}/api/ext/v1`;

	async lookupUsers(UserIds: number[]): Promise<Map<number, ApiUser>> {
		const Users = new Map<number, ApiUser>();
		for (let Index = 0; Index < UserIds.length; Index += MaxLookupIds) {
			const Chunk = UserIds.slice(Index, Index + MaxLookupIds);
			const Page = await this.request<ApiLookupResponse>(`/users?ids=${Chunk.join(',')}`);
			for (const User of Object.values(Page.users)) Users.set(User.userId, User);
		}
		return Users;
	}

	async getUser(UserId: number): Promise<ApiUserDetail | null> {
		try {
			return await this.request<ApiUserDetail>(`/users/${UserId}`);
		} catch (Err) {
			if (Err instanceof ApiError && Err.Status === 404) return null;
			throw Err;
		}
	}

	async submitUser(UserId: number): Promise<SubmitStatus> {
		const Reply = await this.request<ApiSubmitResponse>('/submit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: UserId })
		});
		return Reply.status;
	}

	async reportSightings(UserIds: number[]): Promise<number> {
		let Accepted = 0;
		for (let Index = 0; Index < UserIds.length; Index += MaxReportIds) {
			const Page = await this.request<ApiReportResponse>('/report', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ verifiedUserIds: UserIds.slice(Index, Index + MaxReportIds) })
			});
			Accepted += Page.accepted;
		}
		return Accepted;
	}

	private async request<T>(Path: string, Init: RequestInit = {}): Promise<T> {
		const Controller = new AbortController();
		const Timer = setTimeout(() => Controller.abort(), TimeoutMs);
		try {
			const Reply = await fetch(`${this.BaseUrl}${Path}`, { ...Init, signal: Controller.signal });
			const Body = (await Reply.json().catch(() => null)) as (T & { error?: string }) | null;
			if (!Reply.ok) throw new ApiError(Reply.status, Body?.error ?? `HTTP ${Reply.status}`);
			if (Body === null) throw new ApiError(Reply.status, 'Empty response body.');
			return Body;
		} finally {
			clearTimeout(Timer);
		}
	}
}
