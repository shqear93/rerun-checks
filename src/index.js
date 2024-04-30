const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const checkNames = core.getInput('check-names').split(', ');
    const { owner, repo } = github.context.repo;
    const token = core.getInput('github-token');
    const octokit = github.getOctokit(token);
    const branch = await getBranchName(octokit, owner, repo);

    core.info(`Branch: ${branch}`);

    const checksResult = await octokit.rest.checks.listForRef({ owner, repo, ref: branch });

    for (const checkName of checkNames) {
      const checkRun = checksResult.data.check_runs.find(check_run => check_run.name === checkName.trim());

      if (checkRun) {
        const workflowId = checkRun.details_url.split('/').slice(-3)[0];

        try {
          await octokit.rest.actions.reRunWorkflow({ owner, repo, run_id: workflowId });
          core.info(`"${checkName}" workflow has been triggered again.`);

        } catch (error) {
          if (error.message.includes('This workflow is already running')) {
            core.warning(`"${checkName}" workflow is already running.`);
          } else {
            throw error;
          }
        }
      } else {
        core.info(`"${checkName}" check found.`);
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function getBranchName(octokit, owner, repo) {
  return core.getInput('target-branch') ||
    github.context?.payload?.pull_request?.head?.ref ||
    getDefaultBranch(octokit, owner, repo);
}

async function getDefaultBranch(octokit, owner, repo) {
  const repoInfo = await octokit.rest.repos.get({ owner, repo });
  return repoInfo.data.default_branch; // default branch
}

run();