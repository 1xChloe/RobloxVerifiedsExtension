import { ApiClient } from './ApiClient';
import { DetailCache } from './DetailCache';
import { LookupBatcher } from './LookupBatcher';
import { LocalStats } from './Roblox/LocalStats';
import { SightingReporter } from './SightingReporter';
import { Settings } from '../Shared/Settings';
import type { Envelope, MessageMap, MessageRequest, MessageResponse, MessageType } from '../Shared/Messages';

type Handler<T extends MessageType> = (Request: MessageRequest<T>) => Promise<MessageResponse<T>>;

const Client = new ApiClient();

async function getClient(): Promise<ApiClient> {
	return Client;
}

const Lookups = new LookupBatcher(getClient);
const Reporter = new SightingReporter(getClient);
const Details = new DetailCache();
const Stats = new LocalStats();

const Handlers: { [T in MessageType]: Handler<T> } = {
	LookupUsers: async ({ UserIds }) => ({ Users: Object.fromEntries(await Lookups.lookup(UserIds)) }),
	GetUser: async ({ UserId }) => {
		const User = await Client.getUser(UserId);
		if (User) await Details.put(User);
		else await Details.remove(UserId);
		return { User };
	},
	GetCachedUser: async ({ UserId }) => ({ User: (await Details.get(UserId))?.User ?? null }),
	GetLocalStats: ({ UserId, BadgeRemoved }) => Stats.get(UserId, BadgeRemoved),
	ReportSightings: async ({ UserIds }) => {
		const { ReportSightings } = await Settings.load();
		return { Queued: ReportSightings ? Reporter.add(UserIds) : 0 };
	},
	SubmitUser: async ({ UserId }) => ({ Status: await Client.submitUser(UserId) })
};

function isKnownMessage(Message: unknown): Message is MessageRequest<MessageType> {
	const Type = (Message as { Type?: unknown } | null)?.Type;
	return typeof Type === 'string' && Object.hasOwn(Handlers, Type);
}

chrome.runtime.onMessage.addListener((Message: unknown, _Sender, SendResponse) => {
	if (!isKnownMessage(Message)) return false;
	const Handle = Handlers[Message.Type] as Handler<keyof MessageMap>;
	Handle(Message)
		.then((Data) => SendResponse({ Ok: true, Data } satisfies Envelope<unknown>))
		.catch((Err: unknown) =>
			SendResponse({ Ok: false, Error: Err instanceof Error ? Err.message : String(Err) } satisfies Envelope<unknown>)
		);
	return true;
});
