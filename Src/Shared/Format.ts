const CompactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCompact(Value: number): string {
	return CompactFormatter.format(Value);
}
