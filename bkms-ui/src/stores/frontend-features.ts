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

import { ref } from 'vue';

import { defineStore } from 'pinia';
import { FrontendFeaturesService } from '~/api/modules/v1/frontend-features';

export type GitRepositoryAuthType = 'OAUTH' | 'PASSWORD';
export interface GitRepositoryCapability {
  authTypes: GitRepositoryAuthType[];
  type: string;
}

export const useFrontendFeaturesStore = defineStore('frontend-features', () => {
  const codeRepoTypes = ref<GitRepositoryCapability[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref(false);
  let pending: Promise<boolean> | undefined;

  function load(): Promise<boolean> {
    if (loaded.value) return Promise.resolve(true);
    if (pending) return pending;
    loading.value = true;
    error.value = false;
    pending = (async () => {
      try {
        const features = await FrontendFeaturesService.getFrontendFeatures({}, { interceptorErr: false });
        const types = features.codeRepoTypes ?? [{ type: 'TGit', authTypes: ['OAUTH'] }];
        codeRepoTypes.value = types
          .filter(item => item.type === 'TGit')
          .map(item => ({
            type: item.type!,
            authTypes: (Array.isArray(item.authTypes) ? item.authTypes : []).filter(
              (auth): auth is GitRepositoryAuthType => auth === 'OAUTH' || auth === 'PASSWORD',
            ),
          }))
          .filter(item => item.authTypes.length > 0);
        if (!codeRepoTypes.value.length) throw new Error('No supported Git repository capability');
        loaded.value = true;
        return true;
      } catch {
        error.value = true;
        return false;
      } finally {
        loading.value = false;
        pending = undefined;
      }
    })();
    return pending;
  }

  return { codeRepoTypes, loaded, loading, error, load };
});
