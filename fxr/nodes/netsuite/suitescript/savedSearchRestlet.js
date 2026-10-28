/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * FXR Saved Search RESTlet for the n8n NetSuite node.
 *
 * Deploy: Customization → Scripting → Scripts → New → upload this file → Create Script Record
 * (RESTlet) → Deploy. Give the deployment the role your integration token/certificate uses,
 * then copy the Script ID and Deployment ID into the n8n credential.
 *
 * POST body: { searchId: string, pageSize?: number (<=1000), pageIndex?: number,
 *              filters?: Array<[name, operator, ...values]> }
 * Response:  { results: object[], pageIndex, pageCount, total }
 * Each result is { id, recordType, <columnLabelOrName>: { value, text } ... } flattened to
 * `value` when there is no display text.
 */
define(['N/search', 'N/error'], (search, error) => {
	const toColumnKey = (column) => column.label || column.name;

	const mapResult = (result) => {
		const row = { id: result.id, recordType: result.recordType };
		for (const column of result.columns) {
			const value = result.getValue(column);
			const text = result.getText(column);
			row[toColumnKey(column)] = text && text !== value ? { value, text } : value;
		}
		return row;
	};

	const run = (body) => {
		if (!body || !body.searchId) {
			throw error.create({ name: 'MISSING_SEARCH_ID', message: 'searchId is required' });
		}
		const pageSize = Math.min(Math.max(Number(body.pageSize) || 1000, 5), 1000);
		const pageIndex = Math.max(Number(body.pageIndex) || 0, 0);

		const loaded = search.load({ id: body.searchId });
		if (Array.isArray(body.filters) && body.filters.length > 0) {
			loaded.filters = loaded.filters.concat(
				body.filters.map((f) => search.createFilter({ name: f[0], operator: f[1], values: f.slice(2) })),
			);
		}

		const paged = loaded.runPaged({ pageSize });
		const pageCount = paged.pageRanges.length;
		const results = pageIndex < pageCount ? paged.fetch({ index: pageIndex }).data.map(mapResult) : [];

		return { results, pageIndex, pageCount, total: paged.count };
	};

	return {
		post: (body) => run(body),
		get: (params) =>
			run({
				searchId: params.searchId,
				pageSize: params.pageSize,
				pageIndex: params.pageIndex,
			}),
	};
});
