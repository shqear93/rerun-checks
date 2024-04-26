const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const checkNames = core.getInput('check-names').split(',');
    const { owner, repo } = github.context.repo;
    const branch = github.context.payload.pull_request.head.ref;

    const token = core.getInput('github-token');
    const octokit = github.getOctokit(token);

    const checksResult = await octokit.rest.checks.listForRef({ owner, repo, ref: branch });

    for (const checkName of checkNames) {
      const checkRun = checksResult.data.check_runs.find(check_run => check_run.name === checkName.trim());

      if (checkRun) {
        const workflowId = checkRun.details_url.split('/').slice(-3)[0];

        await octokit.rest.actions.reRunWorkflow({ owner, repo, run_id: workflowId });
        console.info(`"${checkName}" workflow has been triggered again.`);
      } else {
        console.info(`No "${checkName}" check found.`);
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();