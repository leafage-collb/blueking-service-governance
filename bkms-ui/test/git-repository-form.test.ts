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

import { reactive } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GitRepositoryForm from '~/components/git-repository-form.vue';
import PasswordInput from '~/components/password-input.vue';

const { getFrontendFeatures, testConnectivity } = vi.hoisted(() => ({
  getFrontendFeatures: vi.fn(),
  testConnectivity: vi.fn(),
}));
vi.mock('~/api/modules/v1/frontend-features', () => ({ FrontendFeaturesService: { getFrontendFeatures } }));
vi.mock('~/api/modules/v1/bkintegrations-bkci', () => ({
  BkintegrationsBkciService: { testBkCIRepositoryConnectivity: testConnectivity },
}));
vi.mock('~/components/git-selector.vue', () => ({ default: { template: '<div data-testid="oauth-selector" />' } }));
vi.mock('bkui-vue', () => {
  return {
    Input: {
      props: { modelValue: String, placeholder: String },
      emits: ['update:modelValue'],
      methods: { focus() {} },
      template:
        '<div><input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" /><slot name="suffix" /></div>',
    },
    Button: {
      props: { disabled: Boolean },
      template: '<button :disabled="disabled"><slot /></button>',
    },
    Alert: {
      props: { theme: String },
      template: '<div :data-theme="theme"><slot name="title" /><slot /></div>',
    },
    Form: { FormItem: { template: '<div><slot /></div>' } },
  };
});

const globals = {
  mocks: { $t: (key: string) => key },
  components: {
    'i18n-t': {
      props: { keypath: String },
      template: '<span>{{ keypath.replace("{0}", "") }}<slot /></span>',
    },
  },
};

describe('Git repository form and password input', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getFrontendFeatures.mockReset().mockResolvedValue({ codeRepoTypes: [{ type: 'TGit', authTypes: ['PASSWORD'] }] });
    testConnectivity.mockReset().mockResolvedValue({});
    Object.defineProperty(window, 'i18n', { configurable: true, value: { t: (key: string) => key } });
  });

  it('renders the grey PASSWORD block with no auth/type controls or OAuth selector', async () => {
    const wrapper = mount(GitRepositoryForm, {
      props: {
        config: reactive({ type: 'TGit', repoURL: '' }),
        workspace: 'space',
        layout: 'horizontal',
        labelWidth: 135,
      },
      global: globals,
    });
    expect(wrapper.find('[data-testid="oauth-selector"]').exists()).toBe(false);
    await flushPromises();
    expect(wrapper.find('.git-credentials-panel').attributes('style')).toContain('margin-left: 135px');
    expect(wrapper.text()).toContain('代码库');
    expect(wrapper.text()).toContain('仓库账号');
    expect(wrapper.text()).toContain('仓库密码');
    expect(wrapper.text()).toContain('用于拉取私有仓库，保存后不再显示。修改账号时需要重新填写密码');
    expect(wrapper.get('.git-repository-password > label').classes()).toContain('required');
    expect(wrapper.text()).not.toContain('鉴权方式');
    expect(wrapper.text()).not.toContain('仓库类型');
    expect(wrapper.find('[data-testid="oauth-selector"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps only the prototype hint and marks a retained password as optional', async () => {
    const baseline = {
      type: 'TGit',
      authType: 'PASSWORD',
      repoURL: 'https://git.example.com/team/app.git',
      username: 'user',
    };
    const wrapper = mount(GitRepositoryForm, {
      props: { config: reactive({ ...baseline }), baseline, workspace: 'space', isEditMode: true },
      global: globals,
    });
    await flushPromises();
    expect(wrapper.get('[data-testid="git-repo-check"]').attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('.git-repository-hint').map(hint => hint.text())).toEqual([
      '用于拉取私有仓库，保存后不再显示。修改账号时需要重新填写密码',
    ]);
    expect(wrapper.get('.git-repository-password > label').classes()).not.toContain('required');
    expect(wrapper.text()).toContain('••••••');
    expect(await wrapper.vm.ensureReady()).toBe(true);
    expect(testConnectivity).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps OAuth in its normal form item', async () => {
    getFrontendFeatures.mockResolvedValue({ codeRepoTypes: [{ type: 'TGit', authTypes: ['OAUTH'] }] });
    const wrapper = mount(GitRepositoryForm, {
      props: { config: reactive({ type: 'TGit' }), workspace: 'space' },
      global: globals,
    });
    await flushPromises();
    expect(wrapper.find('.git-credentials-panel').exists()).toBe(false);
    expect(wrapper.find('[data-testid="oauth-selector"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the connected repository URL in bold within the success alert', async () => {
    const config = reactive({
      type: 'TGit',
      repoURL: 'https://git.example.com/team/app.git',
      username: 'user',
      password: 'secret',
    });
    const wrapper = mount(GitRepositoryForm, { props: { config, workspace: 'space' }, global: globals });
    await flushPromises();
    await wrapper.get('[data-testid="git-repo-check"]').trigger('click');
    await flushPromises();

    const alert = wrapper.get('[data-testid="git-repo-result"]');
    expect(alert.attributes('data-theme')).toBe('success');
    expect(alert.text()).toContain('连接成功');
    expect(alert.text()).toContain('已成功连接到代码仓库');
    expect(alert.get('strong').text()).toBe(config.repoURL);
    wrapper.unmount();
  });

  it('preserves the backend product message in the error alert', async () => {
    const message = '仓库账号或密码不正确，无法访问该代码库';
    testConnectivity.mockRejectedValueOnce({ error: { message } });
    const wrapper = mount(GitRepositoryForm, {
      props: {
        config: reactive({
          type: 'TGit',
          repoURL: 'https://git.example.com/team/app.git',
          username: 'user',
          password: 'secret',
        }),
        workspace: 'space',
      },
      global: globals,
    });
    await flushPromises();
    await wrapper.get('[data-testid="git-repo-check"]').trigger('click');
    await flushPromises();

    const alert = wrapper.get('[data-testid="git-repo-result"]');
    expect(alert.attributes('data-theme')).toBe('danger');
    expect(alert.text()).toBe(message);
    expect(alert.find('strong').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each(['repoURL', 'username'] as const)(
    'keeps a replacement password editable after restoring the saved %s',
    async field => {
      const baseline = {
        type: 'TGit',
        authType: 'PASSWORD',
        repoURL: 'https://git.example.com/team/app.git',
        username: 'user',
      };
      const config = reactive({ ...baseline, password: '' });
      const wrapper = mount(GitRepositoryForm, {
        props: { config, baseline, workspace: 'space', isEditMode: true },
        global: globals,
      });
      await flushPromises();
      config[field] = field === 'repoURL' ? 'https://git.example.com/team/other.git' : 'other-user';
      await flushPromises();
      expect(wrapper.get('.git-repository-password > label').classes()).toContain('required');
      await wrapper.get('[data-testid="git-repo-password"] input').setValue('replacement');
      config[field] = baseline[field];
      await flushPromises();
      expect(wrapper.get('.git-repository-password > label').classes()).not.toContain('required');

      expect(wrapper.get<HTMLInputElement>('[data-testid="git-repo-password"] input').element.value).toBe(
        'replacement',
      );
      expect(wrapper.find('[data-testid="git-repo-restore"]').exists()).toBe(true);
      expect(wrapper.find('.credential-password-modified').exists()).toBe(true);
      // 提示语位于密码说明文案下方
      const text = wrapper.text();
      expect(text).toContain('密码已修改，保存后生效');
      expect(text.indexOf('用于拉取私有仓库')).toBeLessThan(text.indexOf('密码已修改，保存后生效'));
      await wrapper.get('[data-testid="git-repo-restore"]').trigger('click');
      expect(config.password).toBe('');
      expect(wrapper.text()).toContain('••••••');
      expect(await wrapper.vm.ensureReady()).toBe(true);
      expect(testConnectivity).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it('restores a password typed in the previous creation step without trimming or edit styling', async () => {
    const wrapper = mount(PasswordInput, { props: { modelValue: ' secret ', credentialMode: true }, global: globals });
    expect(wrapper.get('input').element.value).toBe(' secret ');
    await wrapper.get('input').setValue(' other secret ');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([' other secret ']);
    expect(wrapper.find('.credential-password-modified').exists()).toBe(false);
    wrapper.unmount();
  });

  it('highlights only a nonempty replacement password in edit mode and restores the saved placeholder', async () => {
    const wrapper = mount(PasswordInput, {
      props: { modelValue: '', credentialMode: true, isEditMode: true, hasCredential: true },
      global: globals,
    });
    await wrapper.get('.cursor-text').trigger('click');
    await wrapper.get('input').setValue('replacement');
    await wrapper.setProps({ modelValue: 'replacement' });
    expect(wrapper.find('.credential-password-modified').exists()).toBe(true);
    await wrapper.get('[data-testid="git-repo-restore"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['']);
    expect(wrapper.text()).toContain('••••••');
    expect(wrapper.find('.credential-password-modified').exists()).toBe(false);
    wrapper.unmount();
  });
});
