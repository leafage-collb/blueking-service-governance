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

import { computed, onScopeDispose, ref, watch } from 'vue';

import { BkintegrationsBkciService } from '~/api/modules/v1/bkintegrations-bkci';
import { useFrontendFeaturesStore } from '~/stores/frontend-features';

export interface GitRepositoryConfig {
  authType?: string;
  password?: string;
  repoAlias?: string;
  repoURL?: string;
  type?: string;
  username?: string;
}

export type GitRepositoryController = ReturnType<typeof useGitRepositoryCredentials>;

export interface GitRepositoryCredentialsOptions {
  isEditMode?: boolean;
  active?: () => boolean;
  /** 编辑模式下已保存的配置，用于复用凭据 */
  getBaseline?: () => GitRepositoryConfig | null | undefined;
  getConfig: () => GitRepositoryConfig | null | undefined;
  workspace: () => string;
}

/** 作废连通结果，并清掉仍留在表单对象上的密码。 */
export function clearGitPasswords(
  invalidate?: () => void,
  ...configs: Array<null | undefined | { password?: string }>
) {
  invalidate?.();
  configs.forEach(config => {
    if (config) delete config.password;
  });
}

/** 当前来源不是 Git 时直接通过，否则执行连通检查。 */
export async function ensureActiveGitReady(
  active: boolean,
  ensureReady?: () => Promise<boolean> | undefined,
): Promise<boolean> {
  if (!active) return true;
  return Boolean(await ensureReady?.());
}

/** 按鉴权模式剔除无关字段。 */
export function serializeGitRepository<T extends GitRepositoryConfig>(config: T): T {
  const result = { ...config };
  if (result.authType === 'PASSWORD') {
    delete result.repoAlias;
    if (!result.password) delete result.password;
  } else {
    delete result.username;
    delete result.password;
  }
  return result;
}

/** 管理代码仓库凭据：鉴权方式收敛、表单校验与连通性测试。 */
export function useGitRepositoryCredentials(options: GitRepositoryCredentialsOptions) {
  const features = useFrontendFeaturesStore();
  // 用户是否手动改过密码
  const passwordModified = ref(false);
  const fieldErrors = ref<Partial<Record<'password' | 'repoURL' | 'username', string>>>({});
  const status = ref<'checking' | 'error' | 'idle' | 'success'>('idle');
  const message = ref('');
  // 输入版本号，变化即自增，用于丢弃过期的异步结果
  let revision = 0;
  // 配置归一化期间为 true，避免触发 watch 重置校验
  let normalizing = false;
  // 已通过测试的配置快照，命中时跳过重复请求
  let verifiedSnapshot = '';
  // 进行中的测试请求，相同配置复用同一个 Promise
  let pending: undefined | { promise: Promise<boolean>; revision: number; snapshot: string };
  // 无 getBaseline 时的兜底基线
  let initialBaseline: GitRepositoryConfig | undefined;

  const active = () => options.active?.() !== false;
  const availableAuthTypes = computed(
    () => features.codeRepoTypes.find(item => item.type === (options.getConfig()?.type || 'TGit'))?.authTypes ?? [],
  );
  // 优先表单值，编辑模式回退 OAUTH，否则取该类型首个支持项
  const effectiveAuthType = computed(
    () => options.getConfig()?.authType || (baseline() ? 'OAUTH' : availableAuthTypes.value[0]) || 'OAUTH',
  );
  const showPassword = computed(() => effectiveAuthType.value === 'PASSWORD');
  const baseline = () => (options.getBaseline ? options.getBaseline() : initialBaseline);
  // 地址与账号未变时可复用已保存的密码
  const hasSavedCredential = computed(() => {
    const saved = baseline();
    const config = options.getConfig();
    return (
      !!options.isEditMode &&
      saved?.authType === 'PASSWORD' &&
      saved.repoURL === config?.repoURL &&
      saved.username === config?.username
    );
  });
  const featuresLoading = computed(() => !features.loaded && !features.error);
  const featuresError = computed(() => features.error);

  /** 作废校验与测试结果。 */
  function invalidate() {
    revision += 1;
    verifiedSnapshot = '';
    pending = undefined;
    status.value = 'idle';
    message.value = '';
    fieldErrors.value = {};
  }

  /** 当前输入快照，相同配置复用已通过或进行中的测试。 */
  function snapshot() {
    const config = options.getConfig();
    return JSON.stringify([
      active(),
      options.workspace(),
      config?.type,
      config?.authType,
      config?.repoURL,
      config?.username,
      config?.password,
      passwordModified.value,
    ]);
  }

  // 任一输入变化即重置校验状态
  watch(
    snapshot,
    () => {
      if (!normalizing) invalidate();
    },
    { flush: 'sync' },
  );
  // 特性加载后把仓库类型与鉴权方式收敛到当前支持的取值
  watch(
    () => [options.getConfig(), features.loaded, active()] as const,
    () => {
      const config = options.getConfig();
      if (!config || !active()) return;
      if (options.isEditMode && !options.getBaseline && !initialBaseline && config.repoURL)
        initialBaseline = { ...config };
      if (!features.loaded) {
        void retryFeatures();
        return;
      }
      const capability = features.codeRepoTypes.find(item => item.type === config.type) ?? features.codeRepoTypes[0];
      normalizing = true;
      try {
        config.type = capability.type;
        // 鉴权方式变化时清理原有凭据
        const currentAuth = config.authType || (baseline() ? 'OAUTH' : '');
        const nextAuth = capability.authTypes.find(item => item === currentAuth) ?? capability.authTypes[0];
        if (currentAuth && currentAuth !== nextAuth) {
          delete config.repoAlias;
          delete config.username;
          delete config.password;
          if (nextAuth === 'OAUTH') config.repoURL = '';
          passwordModified.value = false;
        }
        config.authType = nextAuth;
      } finally {
        normalizing = false;
      }
    },
    { immediate: true, flush: 'sync' },
  );

  /** 拉取前端特性配置。 */
  async function retryFeatures() {
    return features.loadGitCapabilities();
  }
  if (active()) void retryFeatures();

  /** 校验字段；requirePassword 为 false 时允许沿用已保存的密码。 */
  function validate(requirePassword: boolean) {
    const config = options.getConfig();
    const errors: typeof fieldErrors.value = {};
    const t = window.i18n.t;
    if (!config?.repoURL) {
      errors.repoURL = t('请输入代码仓库地址');
    } else if (showPassword.value) {
      // 要求不含账号密码的 HTTPS 地址
      try {
        const url = new URL(config.repoURL);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || config.repoURL.length > 512) {
          errors.repoURL = t('请输入不含账号密码的 HTTPS 仓库地址');
        }
      } catch {
        errors.repoURL = t('请输入不含账号密码的 HTTPS 仓库地址');
      }
    }
    if (showPassword.value) {
      // 账号密码均有长度上限
      if (!config?.username) errors.username = t('请输入仓库账号');
      else if (config.username.length > 128) errors.username = t('仓库账号不能超过128个字符');
      if (requirePassword && !config?.password) errors.password = t('请输入仓库密码');
      else if ((config?.password?.length ?? 0) > 256) errors.password = t('仓库密码不能超过256个字符');
    }
    fieldErrors.value = errors;
    return Object.keys(errors).length === 0;
  }

  /** 测试连通性，相同配置复用已通过结果或进行中的请求。 */
  async function testConnectivity(): Promise<boolean> {
    if (!active()) return false;
    const startRevision = revision;
    if ((!features.loaded && !(await features.loadGitCapabilities())) || revision !== startRevision) return false;
    if (!validate(true)) return false;
    const currentSnapshot = snapshot();
    if (verifiedSnapshot === currentSnapshot) return true;
    if (pending?.snapshot === currentSnapshot) return pending.promise;
    const config = options.getConfig()!;
    const currentRevision = revision;
    status.value = 'checking';
    message.value = '';
    const promise = (async () => {
      try {
        await BkintegrationsBkciService.testBkCIRepositoryConnectivity(
          {
            workspaceID: options.workspace(),
            repoURL: config.repoURL!,
            username: config.username!,
            password: config.password!,
          },
          { interceptorErr: false },
        );
        if (revision !== currentRevision) return false;
        verifiedSnapshot = currentSnapshot;
        status.value = 'success';
        message.value = window.i18n.t('代码仓库连通性测试成功');
        return true;
      } catch (error) {
        if (revision !== currentRevision) return false;
        const apiError = error as { error?: { message?: string }; message?: string; msg?: string };
        status.value = 'error';
        message.value =
          apiError.error?.message ||
          apiError.message ||
          apiError.msg ||
          window.i18n.t('代码仓库连通性测试失败，请检查仓库地址和账号密码');
        return false;
      } finally {
        if (pending?.revision === currentRevision) pending = undefined;
      }
    })();
    pending = { snapshot: currentSnapshot, revision: currentRevision, promise };
    return promise;
  }

  /** 提交前校验：密码模式需连通性通过，可沿用已保存密码时跳过测试。 */
  async function ensureReady(): Promise<boolean> {
    if (!active()) return true;
    const startRevision = revision;
    if ((!features.loaded && !(await features.loadGitCapabilities())) || revision !== startRevision) return false;
    if (!options.getConfig()) return false;
    // 地址与账号未变且未重新输入密码，视为沿用已保存凭据
    const canRetain = hasSavedCredential.value && !options.getConfig()?.password;
    if (!validate(showPassword.value && !canRetain)) return false;
    if (!showPassword.value || canRetain) return true;
    return testConnectivity();
  }

  // 销毁时作废进行中的结果，回调只认 revision
  onScopeDispose(invalidate);

  return {
    availableAuthTypes,
    effectiveAuthType,
    showPassword,
    hasSavedCredential,
    passwordModified,
    fieldErrors,
    status,
    message,
    featuresLoading,
    featuresError,
    ensureReady,
    testConnectivity,
    invalidate,
    retryFeatures,
  };
}
