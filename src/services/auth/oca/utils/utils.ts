import crypto from "crypto"
import fs from "fs"
import {
	DEFAULT_IDCS_CLIENT_ID,
	DEFAULT_IDCS_PORT_CANDIDATES,
	DEFAULT_IDCS_URL,
	DEFAULT_IDSC_SCOPES,
	OCA_CONFIG_PATH,
} from "../utils/constants"
import type { OcaConfig } from "./types"

/**
 * Loads OCA auth configuration, falling back to built-in defaults.
 *
 * Behavior:
 * - Attempts to read a user-provided JSON config from OCA_CONFIG_PATH.
 * - If the file is missing or invalid JSON, silently falls back to defaults.
 * - Combines user-provided values with defaults via nullish coalescing (??).
 *
 * Returns the effective configuration used by OCA auth flows.
 */
export const getOcaConfig = (): OcaConfig => {
	// Holds raw values loaded from the optional on-disk config.
	// Using `any` here is intentional; we coerce into a typed OcaConfig below.
	let cfg: any = {}
	try {
		// Read and parse the user config file, if present.
		const raw = fs.readFileSync(OCA_CONFIG_PATH, "utf-8")
		cfg = JSON.parse(raw)
	} catch {
		// Intentionally ignore read/parse errors and use default values instead.
		// This keeps the auth flow resilient when no user config is provided.
	}
	// Overlay user-provided values onto defaults. For each field, prefer the file
	// value if it is defined; otherwise, use the default constant.
	const ocaConfig: OcaConfig = {
		client_id: cfg.client_id ?? DEFAULT_IDCS_CLIENT_ID,
		idcs_url: cfg.idcs_url ?? DEFAULT_IDCS_URL,
		scopes: cfg.scopes ?? DEFAULT_IDSC_SCOPES,
		ports: cfg.ports ?? DEFAULT_IDCS_PORT_CANDIDATES,
	}
	return ocaConfig
}

// Generates a cryptographically random string (for state/nonce)
export function generateRandomString(length = 32, chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
	const randomBytes = crypto.randomBytes(length)
	return Array.from(randomBytes)
		.map((b) => chars[b % chars.length])
		.join("")
}

// PKCE code verifier (high entropy)
export function generateCodeVerifier(length = 128): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
	const randomBytes = crypto.randomBytes(length)
	return Array.from(randomBytes)
		.map((b) => chars[b % chars.length])
		.join("")
}

// PKCE code challenge (SHA-256, base64-url)
export function pkceChallengeFromVerifier(verifier: string): string {
	return crypto
		.createHash("sha256")
		.update(verifier)
		.digest("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "")
}

import { type JwtPayload, jwtDecode } from "jwt-decode"
import { ProxyAgent } from "proxy-agent"
import * as vscode from "vscode"
import { name, version } from "../../../../../package.json"

/**
 * Generates a compliant customer opc-request-id segment.
 *
 * Format (32 hex):
 *   [token hash (8)] [taskId hash (8)] [timestamp (8)] [random (8)]
 * - token hash:    first 4 bytes of SHA-256(token)
 * - taskId hash:   first 4 bytes of SHA-256(taskId)
 * - timestamp:     Unix seconds since epoch, 8 hex digits
 * - random:        strong random, 8 hex digits
 *
 * Use: Send this single value as the opc-request-id header.
 */
export async function generateOpcRequestId(taskId: string, token: string): Promise<string> {
	async function hash8(str: string): Promise<string> {
		const data = new TextEncoder().encode(str)
		const hash = await crypto.subtle.digest("SHA-256", data)
		return Array.from(new Uint8Array(hash).slice(0, 4))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
	}

	const [tokenHex, taskHex] = await Promise.all([hash8(token), hash8(taskId)])
	const timestampHex = Math.floor(Date.now() / 1000)
		.toString(16)
		.padStart(8, "0")

	function randomHex8(): string {
		const arr = new Uint32Array(1)
		crypto.getRandomValues(arr)
		return arr[0].toString(16).padStart(8, "0")
	}

	// Compose: token(8) + task(8) + time(8) + rnd(8) = 32 hex
	return tokenHex + taskHex + timestampHex + randomHex8()
}

/**
 * Create headers for OCA requests
 */

export async function createOcaHeaders(accessToken: string, taskId: string): Promise<Record<string, string>> {
	const opcRequestId = await generateOpcRequestId(taskId, accessToken)

	return {
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "application/json",
		client: "Cline",
		"client-version": `${name}-${version}`,
		"client-ide": vscode.env.appName,
		"client-ide-version": vscode.version,
		"opc-request-id": opcRequestId,
	}
}

/**
 * Proxy helpers via environment variables.
 * - Honors HTTPS_PROXY/HTTP_PROXY/ALL_PROXY and NO_PROXY (upper/lowercase)
 * - Disables axios' built-in proxy by returning proxy: false and Node agents
 * - Uses a single ProxyAgent instance for both HTTP and HTTPS
 */
function getEnv(name: string): string | undefined {
	return process.env[name] || process.env[name.toLowerCase()]
}

/**
 * Returns the primary proxy URL, if any.
 * Prefers HTTPS_PROXY/HTTP_PROXY, then falls back to ALL_PROXY.
 */
export function getProxyUrl(): string | undefined {
	return getEnv("HTTPS_PROXY") || getEnv("HTTP_PROXY") || getEnv("ALL_PROXY")
}

let sharedProxyAgent: ProxyAgent | undefined

/**
 * Returns axios-compatible agent options that:
 * - Use ProxyAgent (auto-detects env proxies and NO_PROXY)
 * - Set proxy: false to avoid axios' own proxy layer
 */
export function getProxyAgents(): { httpAgent?: any; httpsAgent?: any; proxy?: false } {
	// If there are no proxy-related envs, avoid creating an agent at all.
	if (!getProxyUrl() && !getEnv("NO_PROXY") && !getEnv("no_proxy")) {
		return {}
	}
	if (!sharedProxyAgent) {
		sharedProxyAgent = new ProxyAgent()
	}
	return { httpAgent: sharedProxyAgent, httpsAgent: sharedProxyAgent, proxy: false as const }
}

/**
 * Decodes a JWT payload without validation and returns the 'sub' claim.
 * Use only for non-security, informational, or display purposes.
 * @param token JWT string
 */
export function parseJwtPayload(token: string): JwtPayload | null {
	try {
		const payload = jwtDecode(token)
		return payload
	} catch {
		return null
	}
}
