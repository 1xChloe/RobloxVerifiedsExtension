export { formatCompact } from '../../Shared/Format';

const DateFormatter = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' });

export function formatDate(Timestamp: number): string {
	return DateFormatter.format(Timestamp);
}

export function formatRelative(Timestamp: number): string {
	const Minutes = Math.floor((Date.now() - Timestamp) / 60_000);
	if (Minutes < 1) return 'just now';
	if (Minutes < 60) return `${Minutes}m ago`;
	const Hours = Math.floor(Minutes / 60);
	if (Hours < 24) return `${Hours}h ago`;
	const Days = Math.floor(Hours / 24);
	if (Days < 30) return `${Days}d ago`;
	return formatDate(Timestamp);
}
