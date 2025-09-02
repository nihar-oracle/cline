import { StringRequest } from "@shared/proto/cline/common"
import { OcaCompatibleModelInfo, OcaModelInfo } from "@shared/proto/cline/models"
import axios from "axios"
import { HostProvider } from "@/hosts/host-provider"
import { OcaAuthService } from "@/services/auth/oca/OcaAuthService"
import { DEFAULT_OCA_BASE_URL } from "@/services/auth/oca/utils/constants"
import { createOcaHeaders, getProxyAgents } from "@/services/auth/oca/utils/utils"
import { Logger } from "@/services/logging/Logger"
import { ShowMessageType } from "@/shared/proto/index.host"
import { Controller } from ".."

/**
 * Refreshes the Oca models and returns the updated model list
 * @param controller The controller instance
 * @param request Empty request object
 * @returns Response containing the Oca models
 */
export async function refreshOcaModels(controller: Controller, request: StringRequest): Promise<OcaCompatibleModelInfo> {
	const parsePrice = (price: any) => {
		if (price) {
			return parseFloat(price) * 1_000_000
		}
		return undefined
	}
	const models: Record<string, OcaModelInfo> = {}
	let defaultModelId: string | undefined
	try {
		const ocaAccessToken = await OcaAuthService.getInstance().getAuthToken(controller)
		const baseUrl = request.value || DEFAULT_OCA_BASE_URL
		const modelsUrl = `${baseUrl}/v1/model/info`
		const headers = await createOcaHeaders(ocaAccessToken!, "models-refresh")
		Logger.log(`Making refresh oca model request with customer opc-request-id: ${headers["opc-request-id"]}`)
		const response = await axios.get(modelsUrl, { headers, ...getProxyAgents() })
		if (response.data?.data) {
			for (const model of response.data.data) {
				const modelId = model.litellm_params?.model
				if (typeof modelId !== "string" || !modelId) {
					continue
				}
				if (!defaultModelId) {
					defaultModelId = modelId
				}
				const modelInfo = model.model_info
				models[modelId] = OcaModelInfo.create({
					maxTokens: model.litellm_params?.max_tokens || -1,
					contextWindow: modelInfo.context_window,
					supportsImages: modelInfo.supports_vision || false,
					supportsPromptCache: modelInfo.supports_caching || false,
					inputPrice: parsePrice(modelInfo.input_price) || 0,
					outputPrice: parsePrice(modelInfo.output_price) || 0,
					cacheWritesPrice: parsePrice(modelInfo.caching_price) || 0,
					cacheReadsPrice: parsePrice(modelInfo.cached_price) || 0,
					description: modelInfo.description,
					thinkingConfig: modelInfo.thinking_config,
					surveyContent: modelInfo.survey_content,
					surveyId: modelInfo.survey_id,
					temperature: modelInfo.temperature || 0,
					banner: modelInfo.banner,
					modelName: modelId,
				})
			}
			console.log("Oca models fetched", models)

			// Fetch current config
			const apiConfiguration = controller.stateManager.getApiConfiguration()
			const updatedConfig = { ...apiConfiguration }

			// Which mode(s) to update?
			const planActSeparateModelsSetting = controller.stateManager.getGlobalStateKey("planActSeparateModelsSetting")
			const currentMode = (await controller.getCurrentMode?.()) ?? "plan"
			const planModeSelectedModelId =
				apiConfiguration?.planModeOcaModelId && models[apiConfiguration.planModeOcaModelId]
					? apiConfiguration.planModeOcaModelId
					: defaultModelId!
			const actModeSelectedModelId =
				apiConfiguration?.actModeOcaModelId && models[apiConfiguration.actModeOcaModelId]
					? apiConfiguration.actModeOcaModelId
					: defaultModelId!

			// Save new model selection(s) to configuration object, per plan/act mode setting
			if (planActSeparateModelsSetting) {
				if (currentMode === "plan") {
					updatedConfig.planModeOcaModelId = planModeSelectedModelId
					updatedConfig.planModeOcaModelInfo = models[planModeSelectedModelId]
				} else {
					updatedConfig.actModeOcaModelId = actModeSelectedModelId
					updatedConfig.actModeOcaModelInfo = models[actModeSelectedModelId]
				}
			} else {
				updatedConfig.planModeOcaModelId = planModeSelectedModelId
				updatedConfig.planModeOcaModelInfo = models[planModeSelectedModelId]
				updatedConfig.actModeOcaModelId = actModeSelectedModelId
				updatedConfig.actModeOcaModelInfo = models[actModeSelectedModelId]
			}

			controller.stateManager.setApiConfiguration(updatedConfig)

			HostProvider.window.showMessage({
				type: ShowMessageType.INFORMATION,
				message: `Refreshed Oca models from ${baseUrl}`,
			})
			await controller.postStateToWebview?.()
		} else {
			console.error("Invalid response from oca API")
			HostProvider.window.showMessage({
				type: ShowMessageType.INFORMATION,
				message: `Failed to fetch Oca models. Please check your configuration from ${baseUrl}`,
			})
		}
	} catch (error) {
		console.error("Error fetching oca models:", error)
		const errorMsg = error.message || "Error refreshing Oca models"
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: errorMsg,
		})
		return OcaCompatibleModelInfo.create({ error: errorMsg })
	}
	return OcaCompatibleModelInfo.create({ models })
}
