<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import type { FxrSsoConfigResponse } from '@n8n/api-types';
import { useI18n } from '@n8n/i18n';
import { useRootStore } from '@n8n/stores/useRootStore';
import {
	N8nButton,
	N8nCallout,
	N8nCheckbox,
	N8nInput,
	N8nOption,
	N8nSelect,
} from '@n8n/design-system';
import CopyInput from '@/app/components/CopyInput.vue';
import { useToast } from '@n8n/composables/useToast';
import { useSettingsStore } from '@n8n/stores/settings.store';

import { getFxrSsoConfig, saveFxrSsoConfig, testFxrSsoConfig } from './fxrSso.api';

const i18n = useI18n();
const toast = useToast();
const rootStore = useRootStore();
const settingsStore = useSettingsStore();

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const config = ref<FxrSsoConfigResponse | null>(null);

const form = ref({
	enabled: false,
	issuer: '',
	clientId: '',
	clientSecret: '',
	allowedDomains: '',
	autoProvision: true,
	defaultRole: 'global:member' as 'global:member' | 'global:admin',
	loginLabel: 'Microsoft',
});

function applyConfig(next: FxrSsoConfigResponse) {
	config.value = next;
	form.value = {
		enabled: next.enabled,
		issuer: next.issuer,
		clientId: next.clientId,
		clientSecret: '',
		allowedDomains: next.allowedDomains,
		autoProvision: next.autoProvision,
		defaultRole: next.defaultRole,
		loginLabel: next.loginLabel,
	};
}

async function load() {
	loading.value = true;
	try {
		applyConfig(await getFxrSsoConfig(rootStore.restApiContext));
	} catch (error) {
		toast.showError(error, i18n.baseText('settings.fxrSso.loadError'));
	} finally {
		loading.value = false;
	}
}

async function save() {
	saving.value = true;
	try {
		applyConfig(await saveFxrSsoConfig(rootStore.restApiContext, { ...form.value }));
		await settingsStore.getSettings();
		toast.showMessage({ title: i18n.baseText('settings.fxrSso.saved'), type: 'success' });
	} catch (error) {
		toast.showError(error, i18n.baseText('settings.fxrSso.saveError'));
	} finally {
		saving.value = false;
	}
}

async function test() {
	testing.value = true;
	try {
		const result = await testFxrSsoConfig(rootStore.restApiContext);
		toast.showMessage({
			title: result.ok
				? i18n.baseText('settings.fxrSso.testOk')
				: i18n.baseText('settings.fxrSso.testFailed'),
			message: result.message,
			type: result.ok ? 'success' : 'error',
		});
	} catch (error) {
		toast.showError(error, i18n.baseText('settings.fxrSso.testFailed'));
	} finally {
		testing.value = false;
	}
}

onMounted(load);
</script>

<template>
	<!-- Same card and field groups as the upstream SAML/OIDC forms (shared sso-form styles). -->
	<div data-test-id="fxr-sso-settings">
		<N8nCallout v-if="config?.managedByEnv" theme="warning" :class="$style.callout">
			{{ i18n.baseText('settings.fxrSso.managedByEnv') }}
		</N8nCallout>

		<div v-if="!loading" :class="$style.card">
			<div :class="$style.group">
				<label>{{ i18n.baseText('settings.fxrSso.title') }}</label>
				<small>{{ i18n.baseText('settings.fxrSso.intro') }}</small>
			</div>

			<div :class="$style.group">
				<label>{{ i18n.baseText('settings.fxrSso.callbackUrl') }}</label>
				<CopyInput
					:value="config?.callbackUrl ?? ''"
					:copy-button-text="i18n.baseText('generic.clickToCopy')"
				/>
				<small>{{ i18n.baseText('settings.fxrSso.callbackUrl.help') }}</small>
			</div>

			<div :class="[$style.group, $style.checkboxGroup]">
				<N8nCheckbox
					v-model="form.enabled"
					:label="i18n.baseText('settings.fxrSso.enabled')"
					:disabled="config?.managedByEnv"
					data-test-id="fxr-sso-enabled"
				/>
			</div>

			<div :class="$style.group">
				<label>{{ i18n.baseText('settings.fxrSso.issuer') }}</label>
				<N8nInput
					v-model="form.issuer"
					:disabled="config?.managedByEnv"
					placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0"
					data-test-id="fxr-sso-issuer"
				/>
			</div>

			<div :class="$style.group">
				<label>{{ i18n.baseText('settings.fxrSso.clientId') }}</label>
				<N8nInput
					v-model="form.clientId"
					:disabled="config?.managedByEnv"
					data-test-id="fxr-sso-client-id"
				/>
			</div>

			<div :class="$style.group">
				<label>{{ i18n.baseText('settings.fxrSso.clientSecret') }}</label>
				<N8nInput
					v-model="form.clientSecret"
					type="password"
					:disabled="config?.managedByEnv"
					:placeholder="
						config?.hasClientSecret ? i18n.baseText('settings.fxrSso.clientSecret.unchanged') : ''
					"
					data-test-id="fxr-sso-client-secret"
				/>
			</div>

			<div :class="$style.group">
				<label>{{ i18n.baseText('settings.fxrSso.allowedDomains') }}</label>
				<N8nInput
					v-model="form.allowedDomains"
					:disabled="config?.managedByEnv"
					placeholder="fxrracing.com"
					data-test-id="fxr-sso-allowed-domains"
				/>
				<small>{{ i18n.baseText('settings.fxrSso.allowedDomains.help') }}</small>
			</div>

			<div :class="[$style.group, $style.checkboxGroup]">
				<N8nCheckbox
					v-model="form.autoProvision"
					:label="i18n.baseText('settings.fxrSso.autoProvision')"
					:disabled="config?.managedByEnv"
					data-test-id="fxr-sso-auto-provision"
				/>
			</div>

			<div :class="$style.group">
				<label>{{ i18n.baseText('settings.fxrSso.defaultRole') }}</label>
				<N8nSelect
					v-model="form.defaultRole"
					:disabled="config?.managedByEnv"
					size="medium"
					data-test-id="fxr-sso-default-role"
				>
					<N8nOption value="global:member" :label="i18n.baseText('settings.fxrSso.role.member')" />
					<N8nOption value="global:admin" :label="i18n.baseText('settings.fxrSso.role.admin')" />
				</N8nSelect>
			</div>

			<div :class="$style.group">
				<label>{{ i18n.baseText('settings.fxrSso.loginLabel') }}</label>
				<N8nInput
					v-model="form.loginLabel"
					:disabled="config?.managedByEnv"
					placeholder="Microsoft"
					data-test-id="fxr-sso-login-label"
				/>
			</div>
		</div>

		<div v-if="!loading" :class="$style.actions">
			<N8nButton
				variant="outline"
				size="large"
				:loading="testing"
				:label="i18n.baseText('settings.fxrSso.test')"
				data-test-id="fxr-sso-test"
				@click="test"
			/>
			<N8nButton
				v-if="!config?.managedByEnv"
				size="large"
				:loading="saving"
				:label="i18n.baseText('settings.fxrSso.save')"
				data-test-id="fxr-sso-save"
				@click="save"
			/>
		</div>
	</div>
</template>

<style lang="scss" module>
@use '@/features/settings/sso/styles/sso-form.module.scss';

.callout {
	margin-bottom: var(--spacing--lg);
}

.actions {
	display: flex;
	gap: var(--spacing--xs);
	justify-content: flex-end;
}
</style>
