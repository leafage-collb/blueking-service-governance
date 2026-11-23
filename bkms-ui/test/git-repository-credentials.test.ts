/*
 * TencentBlueKing is pleased to support the open source community by making
 * 蓝鲸智云 - 服务治理 (BlueKing Service Governance) available.
 * Copyright (C) Tencent. All rights reserved.
 * Licensed under the MIT License (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 *  http://opensource.org/licenses/MIT
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * We undertake not to change the open source license (MIT license) applicable
 * to the current version of the project delivered to anyone in the future.
 */

import { effectScope, nextTick, ref } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeGitRepository, useGitRepositoryCredentials } from '~/composables/use-git-repository-credentials';
import { useFrontendFeaturesStore } from '~/stores/frontend-features';

import type {
  GitRepositoryConfig,
  GitRepositoryCredentialsOptions,
} from '~/composables/use-git-repository-credentials';

const { getFrontendFeatures, testConnectivity } = vi.hoisted(() => ({
  getFrontendFeatures: vi.fn(),
  testConnectivity: vi.fn(),
}));
vi.mock('~/api/modules/v1/frontend-features', () => ({ FrontendFeaturesService: { getFrontendFeatures } }));
vi.mock('~/api/modules/v1/bkintegrations-bkci', () => ({
  BkintegrationsBkciService: { testBkCIRepositoryConnectivity: testConnectivity },
}));

const validConfig = () => ({
  type: 'TGit',
  authType: 'PASSWORD',
  repoURL: 'https://git.example.com/team/app.git',
  username: 'user',
  password: ' secret ',
});

describe('Git repository credentials', () => {
  const scopes: ReturnType<typeof effectScope>[] = [];

  function mount(
    config = ref<GitRepositoryConfig>(validConfig()),
    options: Partial<GitRepositoryCredentialsOptions> = {},
  ) {
    const scope = effectScope();
    scopes.push(scope);
    const controller = scope.run(() =>
      useGitRepositoryCredentials({
        getConfig: () => config.value,
        workspace: () => 'workspace-1',
        ...options,
      }),
    )!;
    return { config, controller, scope };
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    getFrontendFeatures.mockReset().mockResolvedValue({ codeRepoTypes: [{ type: 'TGit', authTypes: ['PASSWORD'] }] });
    testConnectivity.mockReset().mockResolvedValue({});
    Object.defineProperty(window, 'i18n', { configurable: true, value: { t: (key: string) => key } });
  });
  afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));

  it('deduplicates capability loading, caches success, and retries a failed load', async () => {
    const store = useFrontendFeaturesStore();
    getFrontendFeatures.mockRejectedValueOnce(new Error('unavailable'));
    const first = store.load();
    const second = store.load();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(getFrontendFeatures).toHaveBeenCalledTimes(1);
    expect(store.error).toBe(true);
    await expect(store.load()).resolves.toBe(true);
    await store.load();
    expect(getFrontendFeatures).toHaveBeenCalledTimes(2);
  });

  it('uses the deployment default for a new repository and treats saved missing auth as OAuth', async () => {
    getFrontendFeatures.mockResolvedValue({ codeRepoTypes: [{ type: 'TGit', authTypes: ['PASSWORD', 'OAUTH'] }] });
    const fresh = mount(ref({ type: 'TGit', repoURL: '' }), { isEditMode: true, getBaseline: () => undefined });
    const saved = { type: 'TGit', repoURL: 'https://git.example.com/team/old.git', repoAlias: 'team/old' };
    const old = mount(ref<GitRepositoryConfig>({ ...saved }), { isEditMode: true, getBaseline: () => saved });
    await useFrontendFeaturesStore().load();
    expect(fresh.config.value.authType).toBe('PASSWORD');
    expect(old.config.value.authType).toBe('OAUTH');
  });

  it('keeps a supported saved auth type even when it is not the default', async () => {
    getFrontendFeatures.mockResolvedValue({ codeRepoTypes: [{ type: 'TGit', authTypes: ['OAUTH', 'PASSWORD'] }] });
    const { config } = mount();
    await useFrontendFeaturesStore().load();
    expect(config.value.authType).toBe('PASSWORD');
  });

  it('requires a new OAuth repository selection when the saved password mode is no longer supported', async () => {
    getFrontendFeatures.mockResolvedValue({ codeRepoTypes: [{ type: 'TGit', authTypes: ['OAUTH'] }] });
    const baseline = { ...validConfig(), repoAlias: 'tgit:team/app' };
    const { config, controller } = mount(ref<GitRepositoryConfig>({ ...baseline }), {
      isEditMode: true,
      getBaseline: () => baseline,
    });
    expect(await controller.ensureReady()).toBe(false);
    expect(config.value).toEqual({ type: 'TGit', authType: 'OAUTH', repoURL: '' });
    expect(controller.fieldErrors.value.repoURL).toBeTruthy();
    expect(testConnectivity).not.toHaveBeenCalled();
  });

  it('keeps the URL but requires fresh credentials when a saved OAuth repository falls back to password mode', async () => {
    const baseline = {
      type: 'TGit',
      authType: 'OAUTH',
      repoURL: 'https://git.example.com/team/app.git',
      repoAlias: 'team/app',
    };
    const { config, controller } = mount(ref<GitRepositoryConfig>({ ...baseline }), {
      isEditMode: true,
      getBaseline: () => baseline,
    });
    expect(await controller.ensureReady()).toBe(false);
    expect(config.value).toEqual({ type: 'TGit', authType: 'PASSWORD', repoURL: baseline.repoURL });
    expect(controller.fieldErrors.value.username).toBeTruthy();
    expect(controller.fieldErrors.value.password).toBeTruthy();
    expect(testConnectivity).not.toHaveBeenCalled();
  });

  it('loads capabilities when a previously empty inactive creation form becomes active', async () => {
    const config = ref<GitRepositoryConfig | null>(null);
    const scope = effectScope();
    scopes.push(scope);
    const controller = scope.run(() =>
      useGitRepositoryCredentials({
        getConfig: () => config.value,
        workspace: () => 'workspace-1',
        active: () => !!config.value,
      }),
    )!;
    expect(getFrontendFeatures).not.toHaveBeenCalled();
    expect(controller.featuresLoading.value).toBe(true);
    config.value = { type: 'TGit', repoURL: '', username: '', password: '' };
    expect(getFrontendFeatures).toHaveBeenCalledTimes(1);
    await useFrontendFeaturesStore().load();
    expect(config.value.authType).toBe('PASSWORD');
    expect(controller.showPassword.value).toBe(true);
  });

  it('validates HTTPS, username and password before making a request', async () => {
    const { config, controller } = mount(
      ref({ ...validConfig(), repoURL: 'git@git.example.com:team/app.git', username: '', password: '' }),
    );
    expect(await controller.ensureReady()).toBe(false);
    expect(controller.fieldErrors.value).toHaveProperty('repoURL');
    expect(controller.fieldErrors.value).toHaveProperty('username');
    expect(controller.fieldErrors.value).toHaveProperty('password');
    expect(testConnectivity).not.toHaveBeenCalled();
    config.value.repoURL = 'https://user:password@git.example.com/team/app.git';
    expect(await controller.ensureReady()).toBe(false);
    expect(controller.fieldErrors.value.repoURL).toBeTruthy();
  });

  it('automatically checks new credentials once, preserves password whitespace, and reuses value snapshots', async () => {
    const { config, controller } = mount();
    expect(await controller.ensureReady()).toBe(true);
    config.value = { ...config.value };
    expect(await controller.ensureReady()).toBe(true);
    expect(testConnectivity).toHaveBeenCalledTimes(1);
    expect(testConnectivity.mock.calls[0][0].password).toBe(' secret ');
    config.value.username = 'other-user';
    expect(await controller.ensureReady()).toBe(true);
    expect(testConnectivity).toHaveBeenCalledTimes(2);
  });

  it('retains an unchanged saved password, including an empty touched field, but cannot preflight without a password', async () => {
    const baseline = { ...validConfig(), password: '' };
    const { controller } = mount(ref({ ...baseline }), { isEditMode: true, getBaseline: () => baseline });
    controller.passwordModified.value = true;
    expect(await controller.ensureReady()).toBe(true);
    expect(testConnectivity).not.toHaveBeenCalled();
    expect(await controller.testConnectivity()).toBe(false);
    expect(controller.fieldErrors.value.password).toBeTruthy();
  });

  it.each(['repoURL', 'username'] as const)('requires a password when saved %s changes', async field => {
    const baseline = { ...validConfig(), password: '' };
    const { config, controller } = mount(ref({ ...baseline }), { isEditMode: true, getBaseline: () => baseline });
    config.value[field] = field === 'repoURL' ? 'https://git.example.com/team/other.git' : 'other-user';
    expect(await controller.ensureReady()).toBe(false);
    expect(controller.fieldErrors.value.password).toBe('请输入仓库密码');
    expect(testConnectivity).not.toHaveBeenCalled();
  });

  it('ignores a late response after a credential edit and checks the current credentials', async () => {
    let release: (value: object) => void = () => {};
    testConnectivity.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const { config, controller } = mount();
    await useFrontendFeaturesStore().load();
    const oldCheck = controller.testConnectivity();
    await nextTick();
    config.value.password = 'new password';
    release({});
    expect(await oldCheck).toBe(false);
    expect(controller.status.value).toBe('idle');
    expect(await controller.ensureReady()).toBe(true);
    expect(testConnectivity).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent checks and displays backend product errors', async () => {
    const { controller } = mount();
    testConnectivity.mockRejectedValueOnce({ msg: '仓库账号或密码不正确，无法访问该代码库' });
    await useFrontendFeaturesStore().load();
    const results = await Promise.all([controller.ensureReady(), controller.testConnectivity()]);
    expect(results).toEqual([false, false]);
    expect(testConnectivity).toHaveBeenCalledTimes(1);
    expect(controller.message.value).toBe('仓库账号或密码不正确，无法访问该代码库');
    expect(await controller.ensureReady()).toBe(true);
  });

  it('does not apply a result after the owner scope is disposed', async () => {
    let release: (value: object) => void = () => {};
    testConnectivity.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const { controller, scope } = mount();
    await useFrontendFeaturesStore().load();
    const checking = controller.testConnectivity();
    await nextTick();
    scope.stop();
    release({});
    expect(await checking).toBe(false);
    expect(controller.status.value).toBe('idle');
  });

  it('abandons save when the source changes away from Git while capabilities are loading', async () => {
    let release: (value: object) => void = () => {};
    getFrontendFeatures.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const active = ref(true);
    const { controller } = mount(undefined, { active: () => active.value });
    const saving = controller.ensureReady();
    active.value = false;
    active.value = true;
    release({ codeRepoTypes: [{ type: 'TGit', authTypes: ['PASSWORD'] }] });
    expect(await saving).toBe(false);
    expect(testConnectivity).not.toHaveBeenCalled();
    expect(await controller.ensureReady()).toBe(true);
  });

  it('accepts a valid first save while capabilities initialize the authentication mode', async () => {
    let release: (value: object) => void = () => {};
    getFrontendFeatures.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const config = ref<GitRepositoryConfig>({
      repoURL: 'https://git.example.com/team/app.git',
      username: 'user',
      password: 'secret',
    });
    const { controller } = mount(config);
    const saving = controller.ensureReady();
    release({ codeRepoTypes: [{ type: 'TGit', authTypes: ['PASSWORD'] }] });
    expect(await saving).toBe(true);
    expect(config.value.authType).toBe('PASSWORD');
    expect(testConnectivity).toHaveBeenCalledTimes(1);
  });

  it('serializes only the selected mode while preserving unrelated build fields and the form', () => {
    const password = { ...validConfig(), password: '', repoAlias: 'old-alias', defaultBranch: 'main' };
    expect(serializeGitRepository(password)).toEqual({
      type: 'TGit',
      authType: 'PASSWORD',
      repoURL: password.repoURL,
      username: 'user',
      defaultBranch: 'main',
    });
    expect(password).toHaveProperty('repoAlias');
    expect(serializeGitRepository({ ...password, authType: 'OAUTH' })).not.toHaveProperty('username');
    expect(serializeGitRepository({ ...password, authType: 'OAUTH' })).not.toHaveProperty('password');
  });
});
