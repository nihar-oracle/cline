import { Controller } from "../index"
import { Empty, EmptyRequest } from "../../../shared/proto/common"
import { OcaTokenManager } from "./util/ocaTokenManager"
import { getAllExtensionState, storeSecret, updateGlobalState } from "@/core/storage/state"
import type { ApiConfiguration, ApiProvider } from "@/shared/api"
import * as vscode from "vscode"
import { Logger } from "@/services/logging/Logger"

/**
 * Handles the user clicking the login link in the UI.
 * Performs the OAuth flow to obtain a token set,
 * which includes access and refresh tokens, as well as the expiration time.
 *
 * @param controller The controller instance.
 * @returns The login URL as a string.
 */
export async function ocaLoginClicked(controller: Controller): Promise<Empty> {
	// Perform oca oauth flow to get token set
	Logger.info("Login button clicked in oca provider page")
	const tokenSet = await OcaTokenManager.getToken()
	if (!tokenSet) {
		throw new Error("Failed to fetch token set")
	}

	await storeSecret(controller.context, "ocaAccessToken", tokenSet.access_token)
	const ocaProvider: ApiProvider = "oca"
	await updateGlobalState(controller.context, "apiProvider", ocaProvider)
	await updateGlobalState(controller.context, "ocaAccessTokenExpiresAt", tokenSet.expires_at)
	await updateGlobalState(controller.context, "ocaAccessTokenSub", tokenSet.sub)

	await controller.postStateToWebview()
	vscode.window.showInformationMessage("Successfully logged in to Oracle Code Assist")

	return Empty.create()
}
