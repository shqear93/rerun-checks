const mockCore = {
  getInput: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
};

const mockOctokit = {
  rest: {
    checks: { listForRef: jest.fn() },
    actions: { reRunJobForWorkflowRun: jest.fn() },
    repos: { get: jest.fn() },
  },
  paginate: jest.fn(),
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
    mockOctokit.paginate.mockResolvedValue([checkRun({ id: 2, name: 'build' })]);

    await waitUntilScheduled(mockOctokit, 'owner', 'repo', 'main', 'build', 1, opts);

    expect(mockCore.warning).not.toHaveBeenCalled();
  });

  it('resolves once the same check run flips to queued', async () => {
    mockOctokit.paginate.mockResolvedValue([checkRun({ id: 1, name: 'build', status: 'queued' })]);

    await waitUntilScheduled(mockOctokit, 'owner', 'repo', 'main', 'build', 1, opts);

    expect(mockCore.warning).not.toHaveBeenCalled();
  });

  it('warns on timeout when nothing changes', async () => {
    mockOctokit.paginate.mockResolvedValue([checkRun({ id: 1, name: 'build', status: 'completed' })]);

    await waitUntilScheduled(mockOctokit, 'owner', 'repo', 'main', 'build', 1, opts);

    expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Timed out'));
  });
});

describe('run', () => {
  beforeEach(() => {
    mockCore.getInput.mockImplementation(name => (name === 'check-names' ? 'build' : ''));
  });

  it('reruns a matching check and confirms it was scheduled', async () => {
    mockOctokit.paginate
      .mockResolvedValueOnce([checkRun({ id: 1, name: 'build' })])
      .mockResolvedValueOnce([checkRun({ id: 2, name: 'build' })]);
    mockOctokit.rest.actions.reRunJobForWorkflowRun.mockResolvedValue({});
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockOctokit.rest.actions.reRunJobForWorkflowRun).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', job_id: '111',
    });
    expect(mockCore.info).toHaveBeenCalledWith('"build" job has been triggered again.');
    expect(mockCore.setOutput).toHaveBeenCalledWith('rerun-checks', 'build');
    expect(mockCore.setOutput).toHaveBeenCalledWith('not-found-checks', '');
    expect(mockCore.setOutput).toHaveBeenCalledWith('already-running-checks', '');
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  it('reruns multiple checks separated without a space after the comma', async () => {
    mockCore.getInput.mockImplementation(name => (name === 'check-names' ? 'build,test' : ''));
    mockOctokit.paginate
      .mockResolvedValueOnce([checkRun({ id: 1, name: 'build' }), checkRun({ id: 2, name: 'test', jobId: '222' })])
      .mockResolvedValueOnce([checkRun({ id: 11, name: 'build' })])
      .mockResolvedValueOnce([checkRun({ id: 22, name: 'test', jobId: '222' })]);
    mockOctokit.rest.actions.reRunJobForWorkflowRun.mockResolvedValue({});
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockOctokit.rest.actions.reRunJobForWorkflowRun).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', job_id: '111',
    });
    expect(mockOctokit.rest.actions.reRunJobForWorkflowRun).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', job_id: '222',
    });
  });

  it('paginates through all pages when forwarding page-size', async () => {
    mockCore.getInput.mockImplementation(name => {
      if (name === 'check-names') return 'build';
      if (name === 'page-size') return '100';
      return '';
    });
    mockOctokit.paginate
      .mockResolvedValueOnce([checkRun({ id: 1, name: 'build' })])
      .mockResolvedValueOnce([checkRun({ id: 2, name: 'build' })]);
    mockOctokit.rest.actions.reRunJobForWorkflowRun.mockResolvedValue({});
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockOctokit.paginate).toHaveBeenCalledWith(
      mockOctokit.rest.checks.listForRef,
      expect.objectContaining({ per_page: '100' })
    );
  });

  it('logs when the check is not found', async () => {
    mockOctokit.paginate.mockResolvedValue([]);
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockCore.info).toHaveBeenCalledWith('"build" check not found.');
    expect(mockOctokit.rest.actions.reRunJobForWorkflowRun).not.toHaveBeenCalled();
    expect(mockCore.setOutput).toHaveBeenCalledWith('not-found-checks', 'build');
  });

  it('warns instead of failing when the job is already running', async () => {
    mockOctokit.paginate.mockResolvedValue([checkRun({ id: 1, name: 'build' })]);
    mockOctokit.rest.actions.reRunJobForWorkflowRun.mockRejectedValue(
      new Error('This workflow is already running')
    );
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockCore.warning).toHaveBeenCalledWith('"build" job is already running.');
    expect(mockCore.setOutput).toHaveBeenCalledWith('already-running-checks', 'build');
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  it('fails the action on unexpected errors', async () => {
    mockOctokit.paginate.mockResolvedValue([checkRun({ id: 1, name: 'build' })]);
    mockOctokit.rest.actions.reRunJobForWorkflowRun.mockRejectedValue(new Error('boom'));
    mockGithub.context.payload = { pull_request: { head: { ref: 'feature-1' } } };

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith('boom');
  });
});
