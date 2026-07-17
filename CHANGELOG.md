# Changelog

## [3.1.0](https://github.com/shqear93/rerun-checks/compare/v3.0.1...v3.1.0) (2026-07-17)


### Features

* add structured JSON output, tighten already-running detection ([4424d30](https://github.com/shqear93/rerun-checks/commit/4424d308f01b6da389e8a4ed60a50f0fa9463057))
* paginate through all checks, add outputs ([a961d3c](https://github.com/shqear93/rerun-checks/commit/a961d3c52c22d7cc1510b3950e4d7ef5fa1264bf))
* retry rerun calls, support rerunning all failed checks, fix matrix duplicates ([50237c7](https://github.com/shqear93/rerun-checks/commit/50237c74b06f6df780b2c6a365d095bc0fae89cc))


### Bug Fixes

* parse check-names without requiring a space after commas ([f02837d](https://github.com/shqear93/rerun-checks/commit/f02837d7a73054178676e435298c4477a4d072d2))
* remove racing e2e workflow_run listeners from master ([c2c64a3](https://github.com/shqear93/rerun-checks/commit/c2c64a3daed641022d36c57c6ac99ded1087fafe))

## [3.0.1](https://github.com/shqear93/rerun-checks/compare/v3.0.0...v3.0.1) (2026-07-16)


### Bug Fixes

* bootstrap release-please at 3.0.1 via release-as ([bd62514](https://github.com/shqear93/rerun-checks/commit/bd62514d044300e1c5430738ed9928ae39c46609))
* confirm job rerun was actually scheduled before reporting success ([6ce80ef](https://github.com/shqear93/rerun-checks/commit/6ce80efc28c1f853a9314b12276034b972bf27d4))
* run release-please in manifest mode ([cf1d61d](https://github.com/shqear93/rerun-checks/commit/cf1d61d0d70f1abf72d2f513a8280f528362d7c2))
* separator ([a3c9711](https://github.com/shqear93/rerun-checks/commit/a3c9711ebe1155a6fd3f5e8b0f15827395b2ac8b))
* use job id instead of run id to avoid rerunning the entire workflow ([cafa5c1](https://github.com/shqear93/rerun-checks/commit/cafa5c1c11c880f9b23e6a73ad8628483fdae798))
