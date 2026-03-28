export interface CsvColumn {
    label: string;
    name: string;
}

export function exportToCsv(
    columns: CsvColumn[],
    rows: any[],
    filename: string,
): void {
    const headers = columns.map(col => col.label);
    const csvRows = rows.map(row =>
        columns
            .map(col => `"${(row[col.name] ?? '').toString().replace(/"/g, '""')}"`)
            .join(','),
    );
    const csvContent = [headers.join(','), ...csvRows].join('\n');

    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}
