const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const checkNames = core.getInput('check-names').split(', ');
    const pageSize = core.getInput('page-size') || undefined;
    const { owner, repo } = github.context.repo;
    const token = core.getInput('github-token');
    const octokit = github.getOctokit(token);
    const branch = await getBranchName(octokit, owner, repo);

    core.info(`Branch: ${branch}`);

    const checksResult = await octokit.rest.checks.listForRef({ owner, repo, ref: branch, per_page: pageSize });

    for (const checkName of checkNames) {
      const checkRun = checksResult.data.check_runs.find(check_run => check_run.name === checkName.trim());

      if (checkRun) {
        const jobId = checkRun.details_url.split('/').slice(-1)[0];

        try {
          await octokit.rest.actions.reRunJobForWorkflowRun({ owner, repo, job_id: jobId });
          await waitUntilScheduled(octokit, owner, repo, branch, checkName.trim(), checkRun.id, { pageSize });
          core.info(`"${checkName}" job has been triggered again.`);

        } catch (error) {
          if (error.message.includes('is already running')) {
            core.warning(`"${checkName}" job is already running.`);
          } else {
            throw error;
          }
        }
      } else {
        core.info(`"${checkName}" check not found.`);
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function waitUntilScheduled(octokit, owner, repo, ref, checkName, previousCheckRunId, { timeoutMs = 30000, intervalMs = 2000, pageSize } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const checksResult = await octokit.rest.checks.listForRef({ owner, repo, ref, per_page: pageSize });
    const checkRun = checksResult.data.check_runs.find(check_run => check_run.name === checkName);

    // A rerun either creates a new check run (different id) or resets the
    // existing one to queued/in_progress - either signals it was scheduled.
    if (checkRun && (checkRun.id !== previousCheckRunId || checkRun.status === 'queued' || checkRun.status === 'in_progress')) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  core.warning(`Timed out waiting for "${checkName}" to be scheduled.`);
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

/* istanbul ignore next */
if (require.main === module) {
  run();
}

module.exports = { run, waitUntilScheduled, getBranchName, getDefaultBranch };