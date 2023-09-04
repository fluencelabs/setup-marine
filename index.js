const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { promisify } = require("util");
const { chmod } = require("fs");
const { Octokit } = require("@octokit/rest");
const { create } = require("@actions/artifact");

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

async function downloadArtifact(artifactName) {
  const artifactClient = create();
  const downloadResponse = await artifactClient.downloadArtifact(artifactName);
  return `${downloadResponse.downloadPath}/marine`;
}

async function getLatestVersionFromReleases() {
  const octokit = new Octokit();
  const releases = await octokit.repos.listReleases({
    owner: "fluencelabs",
    repo: "marine",
  });
  const latestRelease = releases.data.find((release) =>
    release.tag_name.startsWith("marine-v")
  );
  if (!latestRelease) {
    throw new Error("No marine release found");
  }
  return latestRelease.tag_name.replace(/^marine-v/, "");
}

async function run() {
  try {
    const platform = guessPlatform();
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    let marinePath;

    const artifactName = core.getInput("artifact-name");
    if (artifactName) {
      try {
        marinePath = await downloadArtifact(artifactName);
        core.addPath(marinePath);
        return;
      } catch (_error) {
        core.warning(
          `Failed to download artifact with name ${artifactName}. Fallback to releases.`,
        );
      }
    }

    let version = core.getInput("version");
    if (version === "latest") {
      version = await getLatestVersionFromReleases();
      core.info(`Latest marine release is v${version}`);
    } else {
      version = version.replace(/^v/, "");
    }

    const filename = `marine`;
    const downloadUrl =
      `${DOWNLOAD_URL}marine-v${version}/${filename}-${platform}`;
    const cachedPath = tc.find("marine", version, platform);

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

    core.addPath(marinePath);
    await promisify(chmod)(`${marinePath}/marine`, 0o755);
    console.log(`${marinePath}/marine --version`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
