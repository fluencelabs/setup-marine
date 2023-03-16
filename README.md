# setup-marine

This actions setups Marine - [Fluence Marine](https://github.com/fluencelabs/marine) command line tool.

## Usage

This action can be run on `ubuntu-latest`, and `macos-latest` GitHub Actions runners.

```yaml
steps:
- uses: fluencelabs/setup-marine@v1
  with:
    version: 0.14.0 # default is latest
```
