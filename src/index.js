const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const checkNamesInput = core.getInput('check-names').trim();
    const rerunAllFailed = checkNamesInput === '*';
    const pageSize = core.getInput('page-size') || undefined;
    const { owner, repo } = github.context.repo;
    const token = core.getInput('github-token');
    const octokit = github.getOctokit(token);
    const branch = await getBranchName(octokit, owner, repo);

    core.info(`Branch: ${branch}`);

    const checkRuns = await octokit.paginate(octokit.rest.checks.listForRef, { owner, repo, ref: branch, per_page: pageSize });

    // { name, checkRun } pairs to act on - checkRun is null when a named
    // check wasn't found. In rerun-all-failed mode there's nothing to
    // "not find", so every entry always has a checkRun.
    const targets = rerunAllFailed
      ? checkRuns.filter(checkRun => checkRun.conclusion === 'failure').map(checkRun => ({ name: checkRun.name, checkRun }))
      : checkNamesInput.split(',').map(name => name.trim()).flatMap(name => {
          const matches = checkRuns.filter(checkRun => checkRun.name === name);
          return matches.length > 0 ? matches.map(checkRun => ({ name, checkRun })) : [{ name, checkRun: null }];
        });

    const rerunChecks = [];
    const notFoundChecks = [];
    const alreadyRunningChecks = [];

    for (const { name: checkName, checkRun } of targets) {
      if (checkRun) {
        const jobId = checkRun.details_url.split('/').slice(-1)[0];

        try {
          await reRunJob(octokit, owner, repo, jobId);
          await waitUntilScheduled(octokit, owner, repo, branch, checkName, checkRun.id, { pageSize });
          core.info(`"${checkName}" job has been triggered again.`);
          rerunChecks.push(checkName);

        } catch (error) {
          if (error.message.includes('is already running')) {
            core.warning(`"${checkName}" job is already running.`);
            alreadyRunningChecks.push(checkName);
          } else {
            throw error;
          }
        }
      } else {
        core.info(`"${checkName}" check not found.`);
        notFoundChecks.push(checkName);
      }
    }

    if (rerunAllFailed && targets.length === 0) {
      core.info('No failed checks found to rerun.');
    }

    core.setOutput('rerun-checks', rerunChecks.join(', '));
    core.setOutput('not-found-checks', notFoundChecks.join(', '));
    core.setOutput('already-running-checks', alreadyRunningChecks.join(', '));
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function reRunJob(octokit, owner, repo, jobId, { retries = 3, baseDelayMs = 1000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await octokit.rest.actions.reRunJobForWorkflowRun({ owner, repo, job_id: jobId });
      return;
    } catch (error) {
      // Not a transient failure - the caller handles this case specially.
      if (error.message.includes('is already running') || attempt > retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
}

async function waitUntilScheduled(octokit, owner, repo, ref, checkName, previousCheckRunId, { timeoutMs = 30000, intervalMs = 2000, pageSize } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const checkRuns = await octokit.paginate(octokit.rest.checks.listForRef, { owner, repo, ref, per_page: pageSize });
    const checkRun = checkRuns.find(check_run => check_run.id === previousCheckRunId);

    // Matched by id, not name, since duplicate names (e.g. matrix jobs) would
    // otherwise make a name-only lookup match the wrong instance. A rerun
    // either replaces this id with a new attempt (id disappears) or resets
    // this same check run to queued/in_progress - either signals scheduled.
    if (!checkRun || checkRun.status === 'queued' || checkRun.status === 'in_progress') {
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

module.exports = { run, waitUntilScheduled, getBranchName, getDefaultBranch, reRunJob };
