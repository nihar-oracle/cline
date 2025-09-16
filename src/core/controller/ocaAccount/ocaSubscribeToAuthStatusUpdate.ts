import { EmptyRequest } from "@shared/proto/cline/common"
import { OcaAuthState } from "@shared/proto/cline/oca_account"
import { OcaAuthService } from "@/services/auth/oca/OcaAuthService"
import { Controller } from ".."
import { StreamingResponseHandler } from "../grpc-handler"

export async function ocaSubscribeToAuthStatusUpdate(
	controller: Controller,
	request: EmptyRequest,
	responseStream: StreamingResponseHandler<OcaAuthState>,
	requestId?: string,
): Promise<void> {
	return OcaAuthService.getInstance(controller).subscribeToAuthStatusUpdate(request, responseStream, requestId)
}
