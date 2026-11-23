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

import { type Page, expect, test } from '@playwright/test';

import {
  GIT_TEST_APP,
  GIT_TEST_CHART_REPO,
  GIT_TEST_PASSWORD,
  GIT_TEST_REPO,
  GIT_TEST_SPACE,
  GIT_TEST_USERNAME,
  installGitCredentialsMocks,
} from '../actions/git-credentials.action';
import AppDetailPage from '../pages/app-detail.page';
import AppPage from '../pages/app.page';
import GitRepositoryForm from '../pages/git-repository-form';

import type { BasePageDependencies } from '../pages/base.page';

function dependencies(page: Page, request: BasePageDependencies['request'], appType: 'helm' | 'trpc' = 'trpc') {
  return {
    page,
    request,
    testConfig: { app: GIT_TEST_APP, appType, env: '', reportDir: 'test-results', space: GIT_TEST_SPACE, token: '' },
  };
}

function repositoryForm(page: Page, parentTestID?: string) {
  const parent = parentTestID ? page.locator(`[data-test-id="${parentTestID}"]`) : page;
  return new GitRepositoryForm(parent.getByTestId('git-repository-form').first());
}

function saveButton(page: Page) {
  return page.getByRole('button', { name: /^(保存|确定)$/ }).last();
}

test.describe('Git 仓库账号密码（全业务接口 mock）', () => {
  test('手动测试空凭证仅显示三个字段红边及必填提示，不校验应用名称', async ({ page, request }, testInfo) => {
    const state = await installGitCredentialsMocks(page);
    await page.goto(`/#/${GIT_TEST_SPACE}/app/create/bkmsapp?framework=blank&language=go`);
    const form = repositoryForm(page);
    await expect(form.root.getByTestId('git-repo-credentials')).toBeVisible();
    await form.check();
    await form.expectEmptyCredentialErrors();
    const appPage = new AppPage(dependencies(page, request));
    await expect(appPage.getFormItem('应用名称').getByRole('textbox')).toHaveValue('');
    await expect(page.locator('.bk-form-error, .bk-form-error-tips')).toHaveCount(0);
    expect(state.checks).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
    expect(state.unexpectedWrites).toHaveLength(0);
    await form.root
      .getByTestId('git-repo-credentials')
      .screenshot({ path: testInfo.outputPath('empty-git-credentials-group.png') });
  });

  for (const [framework, language] of [
    ['trpc', 'go'],
    ['taf', 'cpp'],
    ['blank', 'go'],
  ]) {
    test(`创建 ${framework}：手动测试仅检查凭证，自动检测失败阻止下一步或创建`, async ({ page, request }, testInfo) => {
      const state = await installGitCredentialsMocks(page);
      await page.goto(`/#/${GIT_TEST_SPACE}/app/create/bkmsapp?framework=${framework}&language=${language}`);
      const form = repositoryForm(page);
      await expect(form.root).toBeVisible();
      await form.fill({ repoURL: GIT_TEST_REPO, username: GIT_TEST_USERNAME, password: GIT_TEST_PASSWORD });
      await form.check();
      await expect.poll(() => state.checks.length).toBe(1);
      await form.expectResult(/成功|通过/);
      expect(state.creates).toHaveLength(0);
      expect(state.oauthRequests).toBe(0);
      await expect(form.root.getByText('密码已修改，保存后生效')).toHaveCount(0);

      // 应用名称未填仍能测试；随后补齐名称，改动凭证使之前成功结果失效。
      const appPage = new AppPage(dependencies(page, request));
      if (framework === 'trpc') {
        await form.expectLayout(appPage.getFormItem('默认分支'));
        await form.expectSuccessAppearance(GIT_TEST_REPO);
        await expect(form.input('password')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await page.screenshot({ path: testInfo.outputPath('create-git-credentials.png'), fullPage: true });
        await form.root
          .getByTestId('git-repo-credentials')
          .screenshot({ path: testInfo.outputPath('create-git-credentials-group.png') });
      }
      await appPage.fillInput('应用名称', 'git-new-app');
      state.failedRepoURL = `${GIT_TEST_REPO}?unreachable=1`;
      await form.fill({ repoURL: state.failedRepoURL });
      await page.getByRole('button', { name: framework === 'blank' ? '创建' : '下一步', exact: true }).click();
      await expect.poll(() => state.checks.length).toBe(2);
      await form.expectResult(state.failureMessage);
      await expect(form.root).toBeInViewport();
      expect(state.creates).toHaveLength(0);
      expect(state.unexpectedWrites).toHaveLength(0);
    });
  }

  test('通用应用无需先手测，自动检测成功后创建，提交凭证并省略别名', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page);
    await page.goto(`/#/${GIT_TEST_SPACE}/app/create/bkmsapp?framework=blank&language=go`);
    const form = repositoryForm(page);
    await expect(form.root).toBeVisible();
    await new AppPage(dependencies(page, request)).fillInput('应用名称', 'git-new-app');
    await form.fill({ repoURL: GIT_TEST_REPO, username: GIT_TEST_USERNAME, password: GIT_TEST_PASSWORD });
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect.poll(() => state.creates.length).toBe(1);
    expect(state.checks).toEqual([
      { repoURL: GIT_TEST_REPO, username: GIT_TEST_USERNAME, password: GIT_TEST_PASSWORD },
    ]);
    expect(state.creates[0]).toMatchObject({
      buildConfig: {
        repoBuildConfig: { authType: 'PASSWORD', username: GIT_TEST_USERNAME, password: GIT_TEST_PASSWORD },
      },
    });
    const buildConfig = state.creates[0].buildConfig as { repoBuildConfig: Record<string, unknown> };
    expect(buildConfig.repoBuildConfig).not.toHaveProperty('repoAlias');
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('编辑密码留空沿用；改密显示提示，恢复后无需检测即可保存', async ({ page, request }, testInfo) => {
    const state = await installGitCredentialsMocks(page);
    const detail = new AppDetailPage(dependencies(page, request));
    await detail.buildConfig.gotoBaseInfo();
    await expect(detail.buildConfig.getBuildConfigSection()).toContainText(GIT_TEST_USERNAME);
    await expect(detail.buildConfig.getBuildConfigSection().getByText('仓库密码', { exact: true })).toHaveCount(0);
    await detail.buildConfig.openBuilderConfigSideslider();
    const form = repositoryForm(page);
    await expect(form.root).toBeVisible();
    await expect(form.root.getByTestId('git-repo-check')).toBeDisabled();
    await form.fill({ password: 'replacement-password' });
    await expect(form.root.getByText('密码已修改，保存后生效')).toBeVisible();
    await expect(form.root.getByTestId('git-repo-restore')).toBeVisible();
    await form.expectLayout();
    await form.expectModifiedPasswordAppearance();
    await page.screenshot({ path: testInfo.outputPath('edit-git-credentials.png'), fullPage: true });
    await form.root
      .getByTestId('git-repo-credentials')
      .screenshot({ path: testInfo.outputPath('edit-git-credentials-group.png') });
    await form.restorePassword();
    await expect(form.root.getByText('密码已修改，保存后生效')).toHaveCount(0);
    await saveButton(page).click();
    await expect.poll(() => state.saves.length).toBe(1);
    expect(state.checks).toHaveLength(0);
    expect(state.saves[0]).toMatchObject({ codeRepo: { authType: 'PASSWORD', username: GIT_TEST_USERNAME } });
    const repo = state.saves[0].codeRepo as Record<string, unknown>;
    expect(repo.password || '').toBe('');
    expect(repo).not.toHaveProperty('repoAlias');
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('编辑账号或地址需重填密码，检测失败不保存，成功后保存不回显密码', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page);
    const detail = new AppDetailPage(dependencies(page, request));
    await detail.buildConfig.gotoBaseInfo();
    await detail.buildConfig.openBuilderConfigSideslider();
    const form = repositoryForm(page);
    await form.fill({ username: 'changed-user' });
    await saveButton(page).click();
    await expect(form.root).toContainText('请输入仓库密码');
    expect(state.checks).toHaveLength(0);
    expect(state.saves).toHaveLength(0);

    state.failedRepoURL = GIT_TEST_REPO;
    await form.fill({ password: GIT_TEST_PASSWORD });
    await saveButton(page).click();
    await form.expectResult(state.failureMessage);
    expect(state.saves).toHaveLength(0);
    state.failedRepoURL = '';
    await form.fill({ repoURL: 'https://git.example.com/team/other.git' });
    await saveButton(page).click();
    await expect.poll(() => state.saves.length).toBe(1);
    expect(state.saves[0]).toMatchObject({
      codeRepo: { authType: 'PASSWORD', username: 'changed-user', password: GIT_TEST_PASSWORD },
    });
    await expect(form.root).toBeHidden();
    await detail.buildConfig.openBuilderConfigSideslider();
    await expect(form.root.getByTestId('git-repo-check')).toBeDisabled();
    await expect(form.root.getByTestId('git-repo-password')).not.toContainText(GIT_TEST_PASSWORD);
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('Helm 创建：Chart 和构建两组独立检测，失败结果位于对应分组', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page, { appType: 'helm' });
    await page.goto(`/#/${GIT_TEST_SPACE}/app/create/helm`);
    const chart = repositoryForm(page, 'helm-chart-git-repository');
    await expect(chart.root).toBeVisible();
    await new AppPage(dependencies(page, request, 'helm')).fillInput('应用名称', 'git-helm-app');
    await page.getByText('代码仓库', { exact: true }).last().click();
    const build = repositoryForm(page, 'helm-build-git-repository');
    await expect(build.root).toBeVisible();
    await chart.fill({ repoURL: GIT_TEST_CHART_REPO, username: 'chart-user', password: 'chart-password' });
    await build.fill({ repoURL: GIT_TEST_REPO, username: 'build-user', password: 'build-password' });
    const appPage = new AppPage(dependencies(page, request, 'helm'));
    await appPage.fillInput('分支', 'main');
    await appPage.fillInput('路径', '.');
    await appPage.fillInput('默认分支', 'main');
    state.failedRepoURL = GIT_TEST_REPO;
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect.poll(() => state.checks.length).toBe(2);
    await chart.expectResult(/成功|通过/);
    await build.expectResult(state.failureMessage);
    expect(state.checks.map(check => check.username)).toEqual(['chart-user', 'build-user']);
    expect(state.creates).toHaveLength(0);
    await expect(chart.root.locator('xpath=ancestor-or-self::*[@inert]')).toHaveCount(0);
    await chart.fill({ username: 'chart-user-retry' });
    await expect(chart.input('username')).toHaveValue('chart-user-retry');
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('Helm 创建预检期间锁定两组凭证及来源，提交检测通过的值', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page, { appType: 'helm' });
    let releaseBuild!: () => void;
    const buildResponse = new Promise<void>(resolve => {
      releaseBuild = resolve;
    });
    let buildStarted = false;
    await page.route(`**/workspaces/${GIT_TEST_SPACE}/bkci-repositories/connectivity-test`, async route => {
      if (route.request().postDataJSON().repoURL === GIT_TEST_REPO) {
        buildStarted = true;
        await buildResponse;
      }
      await route.fallback();
    });
    await page.goto(`/#/${GIT_TEST_SPACE}/app/create/helm`);
    const chart = repositoryForm(page, 'helm-chart-git-repository');
    await expect(chart.root).toBeVisible();
    const appPage = new AppPage(dependencies(page, request, 'helm'));
    await appPage.fillInput('应用名称', 'git-helm-app');
    await page.getByText('代码仓库', { exact: true }).last().click();
    const build = repositoryForm(page, 'helm-build-git-repository');
    await chart.fill({ repoURL: GIT_TEST_CHART_REPO, username: 'chart-user', password: 'chart-password' });
    await build.fill({ repoURL: GIT_TEST_REPO, username: 'build-user', password: 'build-password' });
    await appPage.fillInput('分支', 'main');
    await appPage.fillInput('路径', '.');
    await appPage.fillInput('默认分支', 'main');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    try {
      await expect.poll(() => buildStarted).toBe(true);
      await chart.expectResult(/成功|通过/);
      for (const form of [chart, build]) {
        await expect(form.root.locator('xpath=ancestor-or-self::*[@inert]')).toHaveCount(1);
      }
      await chart.input('username').scrollIntoViewIfNeeded();
      const inputBox = await chart.input('username').boundingBox();
      if (!inputBox) throw new Error('Chart 仓库账号字段应可见');
      await page.mouse.click(inputBox.x + inputBox.width / 2, inputBox.y + inputBox.height / 2);
      await page.keyboard.press('Control+A');
      await page.keyboard.insertText('untested-chart-user');
      await expect(chart.input('username')).toHaveValue('chart-user');
      const helmRepo = page.getByRole('radio', { name: 'Helm Repo', exact: true, includeHidden: true });
      const sourceBox = await helmRepo.boundingBox();
      if (!sourceBox) throw new Error('Helm Repo 来源应可见');
      await page.mouse.click(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await expect(chart.root).toBeVisible();
      expect(state.creates).toHaveLength(0);
    } finally {
      releaseBuild();
    }
    await expect.poll(() => state.creates.length).toBe(1);
    expect(state.checks.map(check => check.username)).toEqual(['chart-user', 'build-user']);
    expect(state.creates[0]).toMatchObject({
      helmSpec: {
        helmSource: { repoType: 'GitRepo', gitRepoConfig: { username: 'chart-user', password: 'chart-password' } },
      },
      buildConfig: { repoBuildConfig: { username: 'build-user', password: 'build-password' } },
    });
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('OAUTH 能力继续展示工蜂项目下拉，无密码字段或连通测试', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page, { authTypes: ['OAUTH'] });
    const detail = new AppDetailPage(dependencies(page, request));
    await detail.buildConfig.gotoBaseInfo();
    await detail.buildConfig.openBuilderConfigSideslider();
    const form = repositoryForm(page);
    await expect(form.root).toContainText('工蜂Git');
    await expect(form.root.getByTestId('git-repo-password')).toHaveCount(0);
    await expect(form.root.getByTestId('git-repo-check')).toHaveCount(0);
    await expect.poll(() => state.oauthRequests).toBeGreaterThan(0);
    await saveButton(page).click();
    await expect.poll(() => state.saves.length).toBe(1);
    expect(state.checks).toHaveLength(0);
    expect(state.saves[0]).toMatchObject({
      codeRepo: { authType: 'OAUTH', repoAlias: 'tgit:team/service', repoURL: GIT_TEST_REPO },
    });
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('Helm 编辑 Chart 配置和构建配置分别沿用或更新凭证', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page, { appType: 'helm' });
    const detail = new AppDetailPage(dependencies(page, request, 'helm'));
    await detail.buildConfig.gotoBaseInfo();
    await expect(page.getByText('仓库密码', { exact: true })).toHaveCount(0);
    await detail.buildConfig.openHelmChartConfigSideslider();
    const chart = repositoryForm(page, 'helm-chart-git-repository');
    await expect(chart.input('username')).toHaveValue(GIT_TEST_USERNAME);
    await saveButton(page).click();
    await expect.poll(() => state.saves.length).toBe(1);
    expect(state.checks).toHaveLength(0);
    expect(state.saves[0]).toMatchObject({
      helmSpec: { helmSource: { gitRepoConfig: { authType: 'PASSWORD', username: GIT_TEST_USERNAME } } },
    });

    await detail.buildConfig.openBuilderConfigSideslider();
    const build = repositoryForm(page, 'helm-build-git-repository');
    await build.fill({ password: 'helm-build-replacement' });
    await saveButton(page).click();
    await expect.poll(() => state.saves.length).toBe(2);
    expect(state.checks).toEqual([
      { repoURL: GIT_TEST_REPO, username: GIT_TEST_USERNAME, password: 'helm-build-replacement' },
    ]);
    expect(state.saves[1]).toMatchObject({ codeRepo: { password: 'helm-build-replacement' } });
    await detail.buildConfig.openHelmChartConfigSideslider();
    await expect(chart.root.getByTestId('git-repo-check')).toBeDisabled();
    await expect(chart.root).not.toContainText('helm-build-replacement');
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('构建管理编辑保存后，分支和 Tag 查询使用后端返回别名', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page);
    const detail = new AppDetailPage(dependencies(page, request));
    await detail.gotoMenu('build');
    await page.getByRole('button', { name: /构建配置$/ }).click();
    const form = repositoryForm(page);
    await form.fill({ password: GIT_TEST_PASSWORD });
    await saveButton(page).click();
    await expect.poll(() => state.saves.length).toBe(1);
    await expect(form.root).toBeHidden();
    await page.getByRole('button', { name: '执行构建', exact: true }).click();
    await expect(page.locator('.repo-ref-select')).toBeVisible();
    await expect.poll(() => state.refs.some(refURL => new URL(refURL).pathname.endsWith('/branches'))).toBe(true);
    await page.getByRole('radio', { name: 'Tag', exact: true }).check();
    await expect.poll(() => state.refs.some(refURL => new URL(refURL).pathname.endsWith('/tags'))).toBe(true);
    await expect.poll(() => state.refs.length).toBeGreaterThanOrEqual(2);
    for (const refURL of state.refs) {
      const url = new URL(refURL);
      expect(url.searchParams.get('repositoryID')).toBe('tgit:team/service');
      expect(url.searchParams.get('repositoryType')).toBe('NAME');
    }
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('详情空仓库和账号显示未填写，密码字段不展示', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page);
    state.app.buildConfig.repoBuildConfig.repoURL = '';
    state.app.buildConfig.repoBuildConfig.username = '';
    const detail = new AppDetailPage(dependencies(page, request));
    await detail.buildConfig.gotoBaseInfo();
    const section = detail.buildConfig.getBuildConfigSection();
    await expect(section.getByText('未填写', { exact: true })).toHaveCount(2);
    await expect(section.getByText('仓库密码', { exact: true })).toHaveCount(0);
    expect(state.unexpectedWrites).toHaveLength(0);
  });

  test('Helm 详情两组空仓库和账号均显示未填写，密码字段不展示', async ({ page, request }) => {
    const state = await installGitCredentialsMocks(page, { appType: 'helm' });
    state.app.buildConfig.repoBuildConfig.repoURL = '';
    state.app.buildConfig.repoBuildConfig.username = '';
    state.app.helmSpec.helmSource.gitRepoConfig.repoURL = '';
    state.app.helmSpec.helmSource.gitRepoConfig.username = '';
    const detail = new AppDetailPage(dependencies(page, request, 'helm'));
    await detail.buildConfig.gotoBaseInfo();
    await expect(detail.buildConfig.getBuildConfigSection().getByText('未填写', { exact: true })).toHaveCount(2);
    await expect(page.getByText('未填写', { exact: true })).toHaveCount(4);
    await expect(page.getByText('仓库密码', { exact: true })).toHaveCount(0);
    expect(state.unexpectedWrites).toHaveLength(0);
  });
});
