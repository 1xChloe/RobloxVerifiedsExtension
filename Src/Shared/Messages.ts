import type { ApiUser, ApiUserDetail, ApiUserStats, SubmitStatus } from './ApiTypes';

export interface MessageMap {
	LookupUsers: { Request: { UserIds: number[] }; Response: { Users: Record<number, ApiUser | null> } };
	GetUser: { Request: { UserId: number }; Response: { User: ApiUserDetail | null } };
	GetCachedUser: { Request: { UserId: number }; Response: { User: ApiUserDetail | null } };
	GetLocalStats: {
		Request: { UserId: number; BadgeRemoved: boolean };
		Response: { Stats: ApiUserStats | null; Pending: boolean; Partial: boolean; UpdatedAt: number | null };
	};
	ReportSightings: { Request: { UserIds: number[] }; Response: { Queued: number } };
	SubmitUser: { Request: { UserId: number }; Response: { Status: SubmitStatus } };
}

export type MessageType = keyof MessageMap;
export type MessageRequest<T extends MessageType> = { Type: T } & MessageMap[T]['Request'];
export type MessageResponse<T extends MessageType> = MessageMap[T]['Response'];
export type Envelope<T> = { Ok: true; Data: T } | { Ok: false; Error: string };

export async function sendMessage<T extends MessageType>(
	Type: T,
	Payload: MessageMap[T]['Request']
): Promise<MessageResponse<T>> {
	const Reply = (await chrome.runtime.sendMessage({ Type, ...Payload })) as Envelope<MessageResponse<T>> | undefined;
	if (!Reply) throw new Error('The extension background did not respond.');
	if (!Reply.Ok) throw new Error(Reply.Error);
	return Reply.Data;
}
