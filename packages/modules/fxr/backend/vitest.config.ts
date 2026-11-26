import { createVitestConfigWithDecorators } from '@n8n/vitest-config/node-decorators';
import { mergeConfig } from 'vite';

export default mergeConfig(createVitestConfigWithDecorators({}, { pinCjs: ['@n8n/decorators'] }), {
	test: {
		pool: 'forks',
		setupFiles: ['./test/setup-test-folder.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
	},
});
