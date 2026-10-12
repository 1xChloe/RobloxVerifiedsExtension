import { isOfficialBuild, StoreUrl, UnofficialMessage } from '../Shared/Official';
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
		if (!isOfficialBuild()) {
			this.showUnofficial();
			return;
		}
		const Current = await Settings.load();
		for (const Key of ToggleKeys) {
			const Input = byId<HTMLInputElement>(Key);
			Input.checked = Current[Key];
			Input.addEventListener('change', () => void this.saveToggle(Key, Input.checked));
		}
	}

	private showUnofficial(): void {
		byId<HTMLDivElement>('Toggles').remove();
		const Link = document.createElement('a');
		Link.href = StoreUrl;
		Link.target = '_blank';
		Link.rel = 'noopener noreferrer';
		Link.textContent = 'Get the official extension';
		this.StatusLine.classList.add('status--warning');
		this.StatusLine.append(UnofficialMessage, document.createElement('br'), Link);
	}

	private async saveToggle(Key: ToggleKey, Enabled: boolean): Promise<void> {
		await Settings.save({ [Key]: Enabled });
		this.StatusLine.textContent = 'Saved. Open Roblox tabs update automatically.';
	}
}

void new PopupController().start();
