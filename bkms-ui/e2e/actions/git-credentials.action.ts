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

import type { Page, Route } from '@playwright/test';

export const GIT_TEST_SPACE = 'git-credentials-test';
export const GIT_TEST_APP = 'git-credentials-app';
export const GIT_TEST_REPO = 'https://git.example.com/team/service.git';
export const GIT_TEST_CHART_REPO = 'https://git.example.com/team/chart.git';
export const GIT_TEST_USERNAME = 'repository-user';
export const GIT_TEST_PASSWORD = 'example-test-password';

type RepoConfig = {
  authType: 'OAUTH' | 'PASSWORD';
  defaultBranch: string;
  dockerBuildArgs: Record<string, string>;
  dockerfile: string;
  imageBuildMode: string;
  password?: string;
  repoAlias: string;
  repoURL: string;
  sourceDir: string;
  type: string;
  username: string;
};

/** 全部业务请求均由 mock 响应，保存和检测不会访问真实后端。 */
export async function installGitCredentialsMocks(
  page: Page,
  options: { appType?: 'helm' | 'trpc'; authTypes?: ('OAUTH' | 'PASSWORD')[] } = {},
) {
  const authTypes = options.authTypes || ['PASSWORD'];
  const state = {
    app: mockGitApp(options.appType, authTypes[0]),
    checks: [] as { password: string; repoURL: string; username: string }[],
    saves: [] as Record<string, unknown>[],
    creates: [] as Record<string, unknown>[],
    refs: [] as string[],
    oauthRequests: 0,
    failedRepoURL: '',
    failureMessage: '仓库账号或密码不正确，无法访问该代码库',
    unexpectedWrites: [] as string[],
  };
  const workspace = { id: GIT_TEST_SPACE, displayName: 'Git credentials test', state: 'Ready', bkSystems: {} };
  const runtime = (framework: string, language: string) => ({
    type: 'bkmsApp',
    framework,
    language,
    schemaVersion: 1,
    mods: {
      frameworkFile: { supported: framework !== 'blank', props: { format: framework === 'taf' ? 'taf' : 'yaml' } },
      platformBuild: { supported: false },
    },
  });
  await page.route('**/*', async route => {
    const request = route.request();
    if (!['xhr', 'fetch', 'eventsource'].includes(request.resourceType())) {
      await route.continue();
      return;
    }
    const url = new URL(request.url());
    const pathname = url.pathname;
    const apiPath = pathname.includes('/bkms-server') ? pathname.split('/bkms-server')[1] : pathname;
    const method = request.method();
    if (pathname.endsWith('/simple_account/info')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 0, code: 0, user_id: 'git-test-user' }),
      });
    } else if (method === 'GET' && apiPath === '/frontend-features') {
      await fulfill(route, { codeRepoTypes: [{ type: 'TGit', authTypes }] });
    } else if (method === 'GET' && apiPath === '/workspaces') {
      await fulfill(route, [workspace]);
    } else if (method === 'GET' && apiPath === `/workspaces/${GIT_TEST_SPACE}`) {
      await fulfill(route, workspace);
    } else if (method === 'GET' && apiPath === '/app-runtime-definitions') {
      await fulfill(route, {
        frameworks: [
          { name: 'trpc', supportedLanguages: ['go'] },
          { name: 'taf', supportedLanguages: ['cpp'] },
          { name: 'blank', supportedLanguages: ['go'] },
        ],
        matrix: [runtime('trpc', 'go'), runtime('taf', 'cpp'), runtime('blank', 'go')],
      });
    } else if (method === 'GET' && apiPath === '/apps/auto-id-suffix') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 0, suffix: '-test', data: { suffix: '-test' } }),
      });
    } else if (method === 'GET' && apiPath === `/workspaces/${GIT_TEST_SPACE}/apps`) {
      await fulfill(route, [state.app]);
    } else if (method === 'GET' && apiPath === `/apps/${GIT_TEST_APP}`) {
      await fulfill(route, state.app);
    } else if (method === 'GET' && apiPath === `/apps/${GIT_TEST_APP}/runtime-mods`) {
      await fulfill(route, runtime(state.app.framework, state.app.language));
    } else if (method === 'GET' && apiPath === `/apps/${GIT_TEST_APP}/builds`) {
      await fulfill(route, { count: 0, results: [] });
    } else if (method === 'GET' && apiPath.endsWith('/recommended-image-tag')) {
      await fulfill(route, 'git-test-tag');
    } else if (method === 'POST' && apiPath === `/workspaces/${GIT_TEST_SPACE}/bkci-repositories/connectivity-test`) {
      const body = request.postDataJSON();
      state.checks.push(body);
      if (body.repoURL === state.failedRepoURL) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: state.failureMessage } }),
        });
      } else {
        await fulfill(route, {});
      }
    } else if (method === 'PUT' && apiPath === `/apps/${GIT_TEST_APP}/build-configs`) {
      const body = request.postDataJSON();
      state.saves.push(body);
      if (body.codeRepo) {
        const repo = { ...body.codeRepo };
        delete repo.password;
        state.app.buildConfig.repoBuildConfig = {
          ...state.app.buildConfig.repoBuildConfig,
          ...repo,
          repoAlias: 'tgit:team/service',
        };
      }
      await fulfill(route, {});
    } else if (method === 'PUT' && apiPath === `/apps/${GIT_TEST_APP}/helm-spec`) {
      const body = request.postDataJSON();
      state.saves.push(body);
      const repo = body.helmSpec?.helmSource?.gitRepoConfig;
      if (repo) {
        const fields = { ...repo };
        delete fields.password;
        state.app.helmSpec.helmSource.gitRepoConfig = {
          ...state.app.helmSpec.helmSource.gitRepoConfig,
          ...fields,
          repoAlias: 'tgit:team/chart',
        };
      }
      await fulfill(route, {});
    } else if (
      method === 'POST' &&
      [`/workspaces/${GIT_TEST_SPACE}/apps`, `/workspaces/${GIT_TEST_SPACE}/bkmsapps`].includes(apiPath)
    ) {
      state.creates.push(request.postDataJSON());
      await fulfill(route, { id: GIT_TEST_APP, name: GIT_TEST_APP, type: state.app.type });
    } else if (method === 'GET' && apiPath.includes('/bkci-repositories/')) {
      state.refs.push(request.url());
      await fulfill(route, [{ name: 'main' }, { name: 'v1.0.0' }]);
    } else if (method === 'GET' && apiPath.endsWith('/bkci-git-projects')) {
      state.oauthRequests++;
      await fulfill(route, [
        { id: 1, alias: 'tgit:team/service', url: GIT_TEST_REPO, projectPath: 'team/service', name: 'service' },
      ]);
    } else if (method === 'GET' && apiPath.endsWith('/bkci-oauth-url')) {
      state.oauthRequests++;
      await fulfill(route, 'https://git.example.com/oauth/authorize');
    } else if (method === 'GET') {
      await fulfill(route, apiPath.endsWith('/cfg-switches') ? {} : []);
    } else {
      state.unexpectedWrites.push(`${method} ${apiPath}`);
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Unexpected write blocked by Git credential test' } }),
      });
    }
  });
  return state;
}

export function mockGitApp(type: 'helm' | 'trpc' = 'trpc', authType: 'OAUTH' | 'PASSWORD' = 'PASSWORD') {
  const repoConfig: RepoConfig = {
    authType,
    defaultBranch: 'main',
    dockerBuildArgs: {},
    dockerfile: 'Dockerfile',
    imageBuildMode: 'repositoryDockerfile',
    repoAlias: 'tgit:team/service',
    repoURL: GIT_TEST_REPO,
    sourceDir: '.',
    type: 'TGit',
    username: GIT_TEST_USERNAME,
  };
  return {
    id: GIT_TEST_APP,
    name: GIT_TEST_APP,
    type,
    framework: type === 'trpc' ? 'trpc' : '',
    language: type === 'trpc' ? 'go' : '',
    workspaceID: GIT_TEST_SPACE,
    visibleEnvNames: [],
    appModelSpec: { command: [], args: [], envVars: [] },
    buildConfig: { sourceType: 'codeRepository', repoBuildConfig: repoConfig },
    helmSpec: {
      helmSource: {
        repoType: 'GitRepo',
        valueFiles: ['values.yaml'],
        gitRepoConfig: { ...repoConfig, repoURL: GIT_TEST_CHART_REPO, repoAlias: 'tgit:team/chart', revision: 'main' },
      },
    },
  };
}

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 0, code: 0, data }),
  });
}
