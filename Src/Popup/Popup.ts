import { Settings, type ExtensionSettings } from '../Shared/Settings';

type ToggleKey = keyof ExtensionSettings;

const ToggleKeys: ToggleKey[] = ['ShowProfileSection', 'ShowNameIcons', 'ShowLinkBadges', 'ShowTileTags', 'ReportSightings'];

function byId<T extends HTMLElement>(Id: string): T {
	const Found = document.getElementById(Id);
	if (!Found) throw new Error(`Popup markup is missing #${Id}.`);
	return Found as T;
}

class PopupController {
	private readonly StatusLine = byId<HTMLParagraphElement>('Status');

	async start(): Promise<void> {
		const Current = await Settings.load();
		for (const Key of ToggleKeys) {
			const Input = byId<HTMLInputElement>(Key);
			Input.checked = Current[Key];
			Input.addEventListener('change', () => void this.saveToggle(Key, Input.checked));
		}
	}

	private async saveToggle(Key: ToggleKey, Enabled: boolean): Promise<void> {
		await Settings.save({ [Key]: Enabled });
		this.StatusLine.textContent = 'Saved. Open Roblox tabs update automatically.';
	}
}

void new PopupController().start();
