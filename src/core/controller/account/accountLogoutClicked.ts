import type { EmptyRequest } from "@shared/proto/cline/common"
import { Empty } from "@shared/proto/cline/common"
import { AuthManager } from "@/services/auth/AuthManager"
import type { Controller } from "../index"

/**
 * Handles the account logout action
 * @param controller The controller instance
 * @param _request The empty request object
 * @returns Empty response
 */
export async function accountLogoutClicked(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	await controller.handleSignOut()
	await AuthManager.getInstance().authService.handleDeauth()
	return Empty.create({})
}
