const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { promisify } = require("util");
const { exec } = require("child_process");
const { chmod } = require("fs");
const { Octokit } = require("@octokit/rest");
const yauzl = require("yauzl");

const DOWNLOAD_URL = "https://github.com/fluencelabs/marine/releases/download/";
const SUPPORTED_PLATFORMS = ["linux-x86_64", "darwin-x86_64"];

function guessPlatform() {
  const os = process.platform;
  const arch = process.arch;
  const platform = `${os}-${arch}`;
  const platformMappings = {
    "linux-x64": "linux-x86_64",
    "darwin-x64": "darwin-x86_64",
  };
  return platformMappings[platform] || platform;
}

async function downloadAndUnpackArtifact(octokit, owner, repo, artifactName) {
  const { data: artifacts } = await octokit.actions.listArtifactsForRepo({
    owner,
    repo,
  });

  const artifact = artifacts.artifacts.find((a) => a.name === artifactName);

  if (!artifact) {
    core.warning(
      `Artifact "${artifactName}" not found. Falling back to GitHub releases.`,
    );
    return null;
  }

  const downloadPath = path.join(process.cwd(), artifact.name);
  const writeStream = fs.createWriteStream(downloadPath);

  return new Promise((resolve, reject) => {
    https.get(artifact.archive_download_url, (response) => {
      response.pipe(writeStream).on("finish", () => {
        yauzl.open(downloadPath, { lazyEntries: true }, (err, zipfile) => {
          if (err) reject(err);

          zipfile.readEntry();

          zipfile.on("entry", (entry) => {
            if (/\/$/.test(entry.fileName)) {
              zipfile.readEntry();
            } else {
              zipfile.extractEntryTo(
                entry,
                process.env.RUNNER_TEMP,
                false,
                true,
                (error) => {
                  if (error) reject(error);
                  resolve(path.join(process.env.RUNNER_TEMP, entry.fileName));
                },
              );
            }
          });
        });
      });
    });
  });
}

async function setupBinary(binaryPath, binaryName) {
  await promisify(chmod)(binaryPath, 0o755);

  core.addPath(path.dirname(binaryPath));

  await promisify(exec)(`${binaryName} --version`);
  core.info(`${binaryName} has been set up successfully`);
}

async function run() {
  try {
    const octokit = new Octokit();
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

    const artifactName = core.getInput("artifact-name");
    if (artifactName) {
      const binaryPath = await downloadAndUnpackArtifact(
        octokit,
        owner,
        repo,
        artifactName,
      );
      if (binaryPath) {
        await setupBinary(binaryPath, artifactName);
        return;
      }
    }

    const platform = guessPlatform();
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    let version = core.getInput("version");
    if (version === "latest") {
      const releases = await octokit.repos.listReleases({
        owner,
        repo,
      });
      const latestRelease = releases.data.find((release) =>
        release.tag_name.startsWith("marine-v")
      );
      if (!latestRelease) {
        throw new Error("No marine release found");
      }
      version = latestRelease.tag_name.replace(/^marine-v/, "");
      core.info(`Latest marine release is v${version}`);
    } else {
      version = version.replace(/^v/, "");
    }

    const filename = `marine`;
    const downloadUrl =
      `${DOWNLOAD_URL}marine-v${version}/${filename}-${platform}`;
    const cachedPath = tc.find("marine", version, platform);

    let marinePath;
    if (!cachedPath) {
      const downloadPath = await tc.downloadTool(downloadUrl);
      marinePath = await tc.cacheFile(
        downloadPath,
        filename,
        "marine",
        version,
      );
    } else {
      marinePath = cachedPath;
    }

    await setupBinary(`${marinePath}/marine`, "marine");
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
