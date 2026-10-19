import { spawn } from 'node:child_process';

/** Variables the build passes on: where binaries and the user's files live, plus the network and certificate setup. */
const PASSED_ENV_NAMES = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'npm_config_cache',
  'NPM_CONFIG_CACHE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'npm_config_proxy',
  'npm_config_https_proxy',
  'npm_config_noproxy',
  'npm_config_cafile',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'CURL_CA_BUNDLE',
  'GIT_SSL_CAINFO',
];

/**
 * FMG's dependencies and build scripts are third-party code, so they get this allowlisted environment and not the
 * whole of `process.env` (which can hold tokens and API keys).
 */
export function createMinimalEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of PASSED_ENV_NAMES) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return { ...env, ...extra };
}

interface iRunOptions {
  cwd: string;
  env?: Record<string, string>;
  shouldCaptureOutput?: boolean;
}

export async function run(command: string, args: string[], { cwd, env, shouldCaptureOutput }: iRunOptions) {
  if (!shouldCaptureOutput) console.log(`> ${command} ${args.join(' ')}`);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: createMinimalEnv(env),
      stdio: shouldCaptureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      shell: process.platform === 'win32' && command === 'npm',
    });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${args[0] ?? ''} failed with exit code ${code}.`));
    });
  });
}
