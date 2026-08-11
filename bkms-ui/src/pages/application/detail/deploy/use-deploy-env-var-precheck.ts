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

import { onBeforeUnmount, ref, watch } from 'vue';

import { type DeployableAppType, useDeployAPIs } from './use-deploy';

import type { UndefinedEnvVarOutput } from '~/@types/v1/deploy';

interface PrecheckParams {
  appID: string;
  appType: DeployableAppType;
  envName: string;
}

/**
 * 部署前环境变量预检查。存在风险时暂停当前提交，等待用户明确取消或继续。
 */
export function useDeployEnvVarPrecheck() {
  const isShow = ref(false);
  const undefinedVars = ref<UndefinedEnvVarOutput[]>([]);
  const actionLocked = ref(false);

  let resolvePending: ((shouldDeploy: boolean) => void) | undefined;

  function settle(shouldDeploy: boolean) {
    if (!resolvePending) return;

    const resolve = resolvePending;
    resolvePending = undefined;
    isShow.value = false;
    resolve(shouldDeploy);
  }

  async function precheck({ appID, appType, envName }: PrecheckParams): Promise<boolean> {
    // 同一个组件同时只允许存在一次待确认的部署。
    if (resolvePending) return false;

    const deployAPIs = useDeployAPIs(appType);
    if (!deployAPIs.preCheckDeployEnvVars) return true;

    const result = await deployAPIs.preCheckDeployEnvVars({ appID, envName });
    const vars = result.undefinedVars ?? [];
    if (vars.length === 0) return true;

    undefinedVars.value = vars;
    actionLocked.value = false;
    isShow.value = true;

    return await new Promise<boolean>(resolve => {
      resolvePending = resolve;
    });
  }

  function cancel() {
    if (actionLocked.value) return;
    settle(false);
  }

  function continueDeploy() {
    if (actionLocked.value || !resolvePending) return;
    actionLocked.value = true;
    settle(true);
  }

  // 标题栏关闭、遮罩关闭等 v-model 变化统一视为取消。
  watch(isShow, value => {
    if (!value && resolvePending && !actionLocked.value) {
      settle(false);
    }
  });

  onBeforeUnmount(() => settle(false));

  return {
    actionLocked,
    cancel,
    continueDeploy,
    isShow,
    precheck,
    undefinedVars,
  };
}
