export const SiteOrigin = 'https://robloxverifieds.com';

export interface ExtensionSettings {
	ShowProfileSection: boolean;
	ShowNameIcons: boolean;
	ShowLinkBadges: boolean;
	ShowTileTags: boolean;
	ReportSightings: boolean;
}

const Defaults: ExtensionSettings = {
	ShowProfileSection: true,
	ShowNameIcons: true,
	ShowLinkBadges: true,
	ShowTileTags: true,
	ReportSightings: true
};

type Listener = (Next: ExtensionSettings, Changed: Array<keyof ExtensionSettings>) => void;

class SettingsStore {
	private Cached: ExtensionSettings | null = null;
	private readonly Listeners: Listener[] = [];
	private Subscribed = false;

	async load(): Promise<ExtensionSettings> {
		const Stored = await chrome.storage.sync.get(Object.keys(Defaults));
		this.Cached = { ...Defaults, ...(Stored as Partial<ExtensionSettings>) };
		this.subscribe();
		return this.Cached;
	}

	current(): ExtensionSettings {
		if (!this.Cached) throw new Error('Settings read before load().');
		return this.Cached;
	}

	async save(Changes: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
		await chrome.storage.sync.set(Changes);
		return this.load();
	}

	onChange(Callback: Listener): void {
		this.Listeners.push(Callback);
		this.subscribe();
	}

	private subscribe(): void {
		if (this.Subscribed) return;
		this.Subscribed = true;
		chrome.storage.onChanged.addListener((Changes, Area) => {
			if (Area !== 'sync') return;
			const Changed = Object.keys(Changes).filter((Key): Key is keyof ExtensionSettings => Key in Defaults);
			if (Changed.length === 0) return;
			void this.load().then((Next) => this.Listeners.forEach((Callback) => Callback(Next, Changed)));
		});
	}
}

export const Settings = new SettingsStore();
