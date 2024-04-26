# Rerun Checks — GitHub Actions

## What is it ?

A GitHub action that reruns specified GitHub checks for a pull request.
This action is useful for re-triggering checks without needing to push
new commits to the pull request.

## Usage

### Classic usage

```yml
on:
  pull_request_review:
    types: [ submitted ]

jobs:
  rerun_checks:
    runs-on: ubuntu-latest
    name: Rerun specified checks
    if: github.event.review.state == 'approved'
    steps:
      - name: Rerun Checks
        uses: shqear93/rerun-checks@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          check-names: 'check1, check2' # Replace with the names of the jobs you want to rerun
```

## Inputs

### Action inputs

| Name           | Description                                       | Required | Default |
|----------------|---------------------------------------------------|----------|---------|
| `github-token` | Token that is used to create comments | ✅        |         |
| `check-names`  | Comma-separated list of check names to rerun      | ✅        |         |

## Permissions

Depending on the permissions granted to your token, you may lack some rights.
To run successfully, this actions at least requires the following permissions:

```yaml
permissions:
  pull-requests: write 
```

## Contributing

If you have suggestions for how rerun-checks could be improved, or want to report a bug, open a pull-request! I'd love
all and any contributions.

## License

[MIT](./LICENSE) © [Khaled AbuShqear](https://github.com/shqear93)
