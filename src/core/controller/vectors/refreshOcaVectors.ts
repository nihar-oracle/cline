import { StringRequest } from "@shared/proto/cline/common"
import { VectorStoreInfo, VectorStores } from "@shared/proto/cline/vectors"
import axios from "axios"
import { HostProvider } from "@/hosts/host-provider"
import { DEFAULT_OCA_BASE_URL } from "@/services/auth/oca/utils/constants"
import { createOcaHeaders } from "@/services/auth/oca/utils/utils"
import { Logger } from "@/services/logging/Logger"
import { ShowMessageType } from "@/shared/proto/index.host"
import { Controller } from ".."

/**
 * Refreshes the Oca models and returns the updated model list
 * @param controller The controller instance
 * @param request Empty request object
 * @returns Response containing the Oca models
 */
export async function refreshOcaVectors(controller: Controller, request: StringRequest): Promise<VectorStores> {
	const vectors: Record<string, VectorStoreInfo> = {}
	try {
		const ocaAccessToken = controller.stateManager.getSecretKey("ocaApiKey")
		const baseUrl = request.value || DEFAULT_OCA_BASE_URL
		const vectorsUrl = `${baseUrl}/vector_store/list`
		console.log(vectorsUrl)
		const headers = await createOcaHeaders(ocaAccessToken!, "models-refresh")
		Logger.log(`Making refresh oca model request with customer opc-request-id: ${headers["opc-request-id"]}`)
		const response = await axios.get(vectorsUrl, { headers })
		console.log("Response: ", response.data.data)
		if (response.data?.data) {
			for (const vectorStore of response.data.data) {
				const vectorStoreId = vectorStore.vector_store_id
				if (typeof vectorStoreId !== "string" || !vectorStoreId) {
					continue
				}
				vectors[vectorStoreId] = VectorStoreInfo.create({
					id: vectorStoreId,
					name: vectorStore.vector_store_name,
					description: vectorStore.vector_store_description,
				})
			}
			console.log("Oca vectors fetched", vectors)

			HostProvider.window.showMessage({
				type: ShowMessageType.INFORMATION,
				message: `Refreshed Oca knowledge bases from ${baseUrl}`,
			})
		} else {
			console.error("Invalid response from oca API")
			HostProvider.window.showMessage({
				type: ShowMessageType.INFORMATION,
				message: `Failed to fetch Oca vectors. Please check your configuration from ${baseUrl}`,
			})
		}
	} catch (error) {
		console.error("Error fetching oca vectors:", error)
		const errorMsg = error.message || "Error refreshing Oca knowledge bases"
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: errorMsg,
		})
		return VectorStores.create({ error: errorMsg })
	}
	return VectorStores.create({ vectors })
}
