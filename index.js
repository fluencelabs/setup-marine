const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { Octokit } = require("@octokit/rest");
const { create } = require("@actions/artifact");
const path = require("path");
const fs = require("fs");
const { execSync } = require('child_process');
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
  const tempDirectory = process.env.RUNNER_TEMP; // GitHub Actions' temp directory

  if (!tempDirectory) {
    throw new Error("Temp directory not found");
  }

  // Create a unique directory for our action within the temp directory
  const uniqueTempDir = path.join(
    tempDirectory,
    `marine-artifact-${Date.now()}`,
  );
  fs.mkdirSync(uniqueTempDir, { recursive: true });

  const downloadResponse = await artifactClient.downloadArtifact(
    artifactName,
    uniqueTempDir,
  );

  const marineBinaryPath = path.join(downloadResponse.downloadPath, "marine");

  // Check if the marine binary exists at the expected location
  if (fs.existsSync(marineBinaryPath)) {
    return downloadResponse.downloadPath; // Return the directory containing the marine binary
  } else {
    throw new Error(
      `Expected marine binary not found in the artifact at path: ${marineBinaryPath}`,
    );
  }
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
    throw new Error("No latest marine release found");
  }
  return latestRelease.tag_name.replace(/^marine-v/, "");
}

async function setupBinary(marinePath) {
    core.addPath(marinePath);
    await fs.promises.chmod(`${marinePath}/marine`, 0o755);
    execSync(`${marinePath}/marine --version`, { stdio: 'inherit' });
}

async function run() {
    try {
        const platform = guessPlatform();
        if (!SUPPORTED_PLATFORMS.includes(platform)) {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        const artifactName = core.getInput("artifact-name");
        let marinePath;

        if (artifactName) {
            try {
                marinePath = await downloadArtifact(artifactName);
                await setupBinary(marinePath);
                return;
            } catch (_error) {
                core.warning(`Failed to download artifact with name ${artifactName}. Fallback to releases.`);
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
        const downloadUrl = `${DOWNLOAD_URL}marine-v${version}/${filename}-${platform}`;
        const cachedPath = tc.find("marine", version, platform);

        if (!cachedPath) {
            const downloadPath = await tc.downloadTool(downloadUrl);
            marinePath = await tc.cacheFile(downloadPath, filename, "marine", version);
        } else {
            marinePath = cachedPath;
        }

        await setupBinary(marinePath);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
