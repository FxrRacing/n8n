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
	N8nInputLabel,
	N8nOption,
	N8nSelect,
	N8nText,
} from '@n8n/design-system';
import CopyInput from '@/app/components/CopyInput.vue';
import { useToast } from '@/app/composables/useToast';
import { useSettingsStore } from '@/app/stores/settings.store';

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
	<div :class="$style.card" data-test-id="fxr-sso-settings">
		<N8nText tag="h3" size="large" bold>{{ i18n.baseText('settings.fxrSso.title') }}</N8nText>
		<N8nText size="small" color="text-light" tag="p" :class="$style.intro">
			{{ i18n.baseText('settings.fxrSso.intro') }}
		</N8nText>

		<N8nCallout v-if="config?.managedByEnv" theme="warning" :class="$style.block">
			{{ i18n.baseText('settings.fxrSso.managedByEnv') }}
		</N8nCallout>

		<div v-if="!loading" :class="$style.form">
			<div :class="$style.block">
				<CopyInput
					:label="i18n.baseText('settings.fxrSso.callbackUrl')"
					:value="config?.callbackUrl ?? ''"
					:copy-button-text="i18n.baseText('generic.clickToCopy')"
				/>
				<N8nText size="small" color="text-light">{{
					i18n.baseText('settings.fxrSso.callbackUrl.help')
				}}</N8nText>
			</div>

			<N8nCheckbox
				v-model="form.enabled"
				:label="i18n.baseText('settings.fxrSso.enabled')"
				:disabled="config?.managedByEnv"
				:class="$style.block"
			/>

			<div :class="$style.block">
				<N8nInputLabel :label="i18n.baseText('settings.fxrSso.issuer')" :required="true">
					<N8nInput
						v-model="form.issuer"
						:disabled="config?.managedByEnv"
						placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0"
						data-test-id="fxr-sso-issuer"
					/>
				</N8nInputLabel>
			</div>

			<div :class="$style.block">
				<N8nInputLabel :label="i18n.baseText('settings.fxrSso.clientId')" :required="true">
					<N8nInput v-model="form.clientId" :disabled="config?.managedByEnv" />
				</N8nInputLabel>
			</div>

			<div :class="$style.block">
				<N8nInputLabel :label="i18n.baseText('settings.fxrSso.clientSecret')">
					<N8nInput
						v-model="form.clientSecret"
						type="password"
						:disabled="config?.managedByEnv"
						:placeholder="
							config?.hasClientSecret ? i18n.baseText('settings.fxrSso.clientSecret.unchanged') : ''
						"
					/>
				</N8nInputLabel>
			</div>

			<div :class="$style.block">
				<N8nInputLabel :label="i18n.baseText('settings.fxrSso.allowedDomains')">
					<N8nInput
						v-model="form.allowedDomains"
						:disabled="config?.managedByEnv"
						placeholder="fxrracing.com"
					/>
				</N8nInputLabel>
				<N8nText size="small" color="text-light">{{
					i18n.baseText('settings.fxrSso.allowedDomains.help')
				}}</N8nText>
			</div>

			<N8nCheckbox
				v-model="form.autoProvision"
				:label="i18n.baseText('settings.fxrSso.autoProvision')"
				:disabled="config?.managedByEnv"
				:class="$style.block"
			/>

			<div :class="$style.block">
				<N8nInputLabel :label="i18n.baseText('settings.fxrSso.defaultRole')">
					<N8nSelect v-model="form.defaultRole" :disabled="config?.managedByEnv" size="medium">
						<N8nOption
							value="global:member"
							:label="i18n.baseText('settings.fxrSso.role.member')"
						/>
						<N8nOption value="global:admin" :label="i18n.baseText('settings.fxrSso.role.admin')" />
					</N8nSelect>
				</N8nInputLabel>
			</div>

			<div :class="$style.block">
				<N8nInputLabel :label="i18n.baseText('settings.fxrSso.loginLabel')">
					<N8nInput
						v-model="form.loginLabel"
						:disabled="config?.managedByEnv"
						placeholder="Microsoft"
					/>
				</N8nInputLabel>
			</div>

			<div :class="$style.actions">
				<N8nButton
					variant="outline"
					:loading="testing"
					:label="i18n.baseText('settings.fxrSso.test')"
					data-test-id="fxr-sso-test"
					@click="test"
				/>
				<N8nButton
					v-if="!config?.managedByEnv"
					:loading="saving"
					:label="i18n.baseText('settings.fxrSso.save')"
					data-test-id="fxr-sso-save"
					@click="save"
				/>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.card {
	padding: var(--spacing--lg);
	border: var(--border-width) var(--border-style) var(--color--foreground);
	border-radius: var(--radius);
	background: var(--color--background--light-3);
}

.intro {
	margin-bottom: var(--spacing--md);
}

.form {
	display: flex;
	flex-direction: column;
}

.block {
	margin-bottom: var(--spacing--md);
}

.actions {
	display: flex;
	gap: var(--spacing--xs);
	justify-content: flex-end;
}
</style>
