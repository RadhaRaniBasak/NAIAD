/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized Environment Configuration & Runtime Startup Validation
 * Validates process.env with Zod and crashes loudly on invalid/missing variables.
 */

import crypto from 'node:crypto';
import { z } from 'zod';

// Load .env in non-production environments (variables already set in the environment win).
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: fall back to the schema defaults below.
  }
}

/**
 * Secrets have no built-in value, so a server that is reachable from outside can never be
 * running on a secret that is published in this repository. Production must set each one;
 * elsewhere an unset secret gets a random value for the lifetime of the process.
 */
const SECRETS = {
  AUTH_TOKEN_SECRET: 32, // signs sign-in tokens
  STORAGE_SIGNING_SECRET: 16, // signs storage URLs and keys field encryption
  STRIPE_WEBHOOK_SECRET: 10, // verifies Stripe webhook signatures
} as const;
type SecretName = keyof typeof SECRETS;

/** Values that earlier versions shipped as defaults. They are public, so production refuses them. */
const PUBLISHED_DEV_SECRETS = ['mayfly-dev-storage-signing-secret-key-32b', 'whsec_test_mode_secret_key_123'];

const secret = (name: SecretName) =>
  z.string().min(SECRETS[name], `${name} must be at least ${SECRETS[name]} characters`).optional();

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),

  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),

  APP_URL: z
    .string()
    .url('APP_URL must be a valid absolute URL')
    .default('http://localhost:3000'),

  // SQLite database file, relative to the repository root or absolute.
  DATABASE_URL: z
    .string()
    .regex(/^file:.+/, 'DATABASE_URL must be a SQLite file URL such as file:data/naiad.db')
    .default('file:data/naiad.db'),

  AUTH_TOKEN_SECRET: secret('AUTH_TOKEN_SECRET'),
  STORAGE_SIGNING_SECRET: secret('STORAGE_SIGNING_SECRET'),
  STRIPE_WEBHOOK_SECRET: secret('STRIPE_WEBHOOK_SECRET'),

  SENTRY_DSN: z
    .string()
    .optional(),

  // Reserved for integrations that are documented but not wired up yet: these are
  // validated at startup so deployments stay configured, but no code reads them today.
  STORAGE_BUCKET_NAME: z
    .string()
    .min(3, 'STORAGE_BUCKET_NAME must be specified')
    .default('naiad-evidence-uploads-local'),

  OPEN_METEO_API_URL: z
    .string()
    .url()
    .default('https://api.open-meteo.com/v1/forecast'),

  FHIR_SERVER_URL: z
    .string()
    .url()
    .default('http://localhost:8080/fhir'),

  SUPPORT_EMAIL: z
    .string()
    .email()
    .default('alerts@naiad.example.org'),

  RESEND_API_KEY: z
    .string()
    .default('re_test_mock_api_key_123'),
});

export type AppConfig = Omit<z.infer<typeof envSchema>, SecretName> & Record<SecretName, string>;

function fail(lines: string[]): never {
  console.error('\n======================================================');
  console.error('❌ FATAL: INVALID OR MISSING ENVIRONMENT CONFIGURATION');
  console.error('======================================================');
  for (const line of lines) {
    console.error(` • ${line}`);
  }
  console.error('======================================================\n');
  console.error('Please check your .env file against .env.example.\n');
  process.exit(1);
}

function validateEnv(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    fail(result.error.issues.map((issue) => `[${issue.path.join('.')}] ${issue.message}`));
  }

  const config = result.data;
  const isProduction = config.NODE_ENV === 'production';
  const problems: string[] = [];
  const secrets = {} as Record<SecretName, string>;

  for (const name of Object.keys(SECRETS) as SecretName[]) {
    const value = config[name];
    if (isProduction && !value) {
      problems.push(`[${name}] must be set in production`);
    } else if (isProduction && PUBLISHED_DEV_SECRETS.includes(value!)) {
      problems.push(`[${name}] is a published development value; set a real secret in production`);
    }
    secrets[name] = value ?? crypto.randomBytes(32).toString('base64url');
  }

  if (isProduction && !config.APP_URL.startsWith('https://')) {
    problems.push('[APP_URL] must use HTTPS in production');
  }
  if (problems.length > 0) {
    fail(problems);
  }

  return { ...config, ...secrets };
}

export const env = validateEnv();
