const mockCore = {
  getInput: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn(),
};

const mockOctokit = {
  rest: {
    checks: { listForRef: jest.fn() },
    actions: { reRunJobForWorkflowRun: jest.fn() },
    repos: { get: jest.fn() },
  },
};

const mockGithub = {
  context: { repo: { owner: 'owner', repo: 'repo' }, payload: {} },
  getOctokit: jest.fn(() => mockOctokit),
};

jest.mock('@actions/core', () => mockCore);
jest.mock('@actions/github', () => mockGithub);

const { run, waitUntilScheduled, getBranchName, getDefaultBranch } = require('../src/index');

function checkRun({ id, name, status = 'completed', jobId = '111' }) {
  return { id, name, status, details_url: `https://github.com/owner/repo/actions/runs/1/job/${jobId}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGithub.context.payload = {};
});

describe('getDefaultBranch', () => {
  it('returns the repo default branch', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({ data: { default_branch: 'main' } });

    await expect(getDefaultBranch(mockOctokit, 'owner', 'repo')).resolves.toBe('main');
  });
});

describe('getBranchName', () => {
  it('prefers the target-branch input', async () => {
    mockCore.getInput.mockReturnValue('release');

    await expect(getBranchName(mockOctokit, 'owner', 'repo')).resolves.toBe('release');
  });

  it('falls back to the pull request head ref', async () => {
    mockCore.getInput.mockReturnValue('');
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await expect(getBranchName(mockOctokit, 'owner', 'repo')).resolves.toBe('feature-1');
  });

  it('falls back to the repo default branch', async () => {
    mockCore.getInput.mockReturnValue('');
    mockOctokit.rest.repos.get.mockResolvedValue({ data: { default_branch: 'main' } });

    await expect(getBranchName(mockOctokit, 'owner', 'repo')).resolves.toBe('main');
  });
});

describe('waitUntilScheduled', () => {
  const opts = { timeoutMs: 20, intervalMs: 1 };

  it('resolves once a check run with a new id appears', async () => {
    mockOctokit.rest.checks.listForRef.mockResolvedValue({
      data: { check_runs: [checkRun({ id: 2, name: 'build' })] },
    });

    await waitUntilScheduled(mockOctokit, 'owner', 'repo', 'main', 'build', 1, opts);

    expect(mockCore.warning).not.toHaveBeenCalled();
  });

  it('resolves once the same check run flips to queued', async () => {
    mockOctokit.rest.checks.listForRef.mockResolvedValue({
      data: { check_runs: [checkRun({ id: 1, name: 'build', status: 'queued' })] },
    });

    await waitUntilScheduled(mockOctokit, 'owner', 'repo', 'main', 'build', 1, opts);

    expect(mockCore.warning).not.toHaveBeenCalled();
  });

  it('warns on timeout when nothing changes', async () => {
    mockOctokit.rest.checks.listForRef.mockResolvedValue({
      data: { check_runs: [checkRun({ id: 1, name: 'build', status: 'completed' })] },
    });

    await waitUntilScheduled(mockOctokit, 'owner', 'repo', 'main', 'build', 1, opts);

    expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Timed out'));
  });
});

describe('run', () => {
  beforeEach(() => {
    mockCore.getInput.mockImplementation(name => (name === 'check-names' ? 'build' : ''));
  });

  it('reruns a matching check and confirms it was scheduled', async () => {
    mockOctokit.rest.checks.listForRef
      .mockResolvedValueOnce({ data: { check_runs: [checkRun({ id: 1, name: 'build' })] } })
      .mockResolvedValueOnce({ data: { check_runs: [checkRun({ id: 2, name: 'build' })] } });
    mockOctokit.rest.actions.reRunJobForWorkflowRun.mockResolvedValue({});
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockOctokit.rest.actions.reRunJobForWorkflowRun).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', job_id: '111',
    });
    expect(mockCore.info).toHaveBeenCalledWith('"build" job has been triggered again.');
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  it('logs when the check is not found', async () => {
    mockOctokit.rest.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } });
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockCore.info).toHaveBeenCalledWith('"build" check not found.');
    expect(mockOctokit.rest.actions.reRunJobForWorkflowRun).not.toHaveBeenCalled();
  });

  it('warns instead of failing when the job is already running', async () => {
    mockOctokit.rest.checks.listForRef.mockResolvedValue({
      data: { check_runs: [checkRun({ id: 1, name: 'build' })] },
    });
    mockOctokit.rest.actions.reRunJobForWorkflowRun.mockRejectedValue(
      new Error('This workflow is already running')
    );
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockCore.warning).toHaveBeenCalledWith('"build" job is already running.');
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  it('fails the action on unexpected errors', async () => {
    mockOctokit.rest.checks.listForRef.mockResolvedValue({
      data: { check_runs: [checkRun({ id: 1, name: 'build' })] },
    });
    mockOctokit.rest.actions.reRunJobForWorkflowRun.mockRejectedValue(new Error('boom'));
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith('boom');
  });
});
