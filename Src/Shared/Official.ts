declare const DevBuild: boolean;

export const OfficialId = 'jepeddnenfcekkflfpnpcnlallfhiecm';

export const StoreUrl = `https://chromewebstore.google.com/detail/robloxverifieds/${OfficialId}`;

export const UnofficialMessage =
	"This is an unofficial copy of RobloxVerifieds. It doesn't work with the site and might not be safe, so remove it and install the official one.";

export function isOfficialBuild(): boolean {
	return DevBuild || chrome.runtime.id === OfficialId;
}
