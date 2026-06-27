import os from "node:os";
import path from "node:path";

type AuthPathOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

export const resolveAuthPath = ({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
}: AuthPathOptions = {}): string => {
  return resolveAuthPaths({ platform, env, homeDir })[0];
};

export const resolveAuthPaths = ({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
}: AuthPathOptions = {}): string[] => {
  if (env.OPENCODE_AUTH_PATH) {
    return [env.OPENCODE_AUTH_PATH];
  }

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA ?? path.join(homeDir, "AppData", "Local");
    return [path.join(localAppData, "opencode", "auth.json")];
  }

  const xdgDataHome = env.XDG_DATA_HOME ?? path.join(homeDir, ".local", "share");
  const currentOpenCodePath = path.join(xdgDataHome, "opencode", "auth.json");

  if (platform === "darwin") {
    return [
      currentOpenCodePath,
      path.join(homeDir, "Library", "Application Support", "opencode", "auth.json"),
    ];
  }

  return [currentOpenCodePath];
};
