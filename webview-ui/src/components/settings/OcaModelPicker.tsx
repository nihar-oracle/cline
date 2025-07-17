import { EmptyRequest } from "@shared/proto/common"
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import React, { useMemo } from "react"
import { useMount } from "react-use"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { ModelsServiceClient } from "../../services/grpc-client"
import { ModelInfoView } from "./common/ModelInfoView"
import { normalizeApiConfiguration } from "./utils/providerUtils"
import { useApiConfigurationHandlers } from "./utils/useApiConfigurationHandlers"
import ThinkingBudgetSlider from "./ThinkingBudgetSlider"

export interface OcaModelPickerProps {
	isPopup?: boolean
}

const OcaModelPicker: React.FC<OcaModelPickerProps> = ({ isPopup }: OcaModelPickerProps) => {
	const { apiConfiguration, ocaModels, setOcaModels, refreshOcaModels } = useExtensionState()
	const { handleFieldsChange } = useApiConfigurationHandlers()
	const [pendingModelId, setPendingModelId] = React.useState<string | null>(null)
	const [showRestrictedPopup, setShowRestrictedPopup] = React.useState(false)

	const handleModelChange = (newModelId: string) => {
		// could be setting invalid model id/undefined info but validation will catch it

		if (ocaModels) {
			const bannerContent = ocaModels[newModelId]?.bannerContent
			if (bannerContent) {
				setPendingModelId(newModelId)
				setShowRestrictedPopup(true)
			} else {
				handleFieldsChange({
					ocaLiteLlmModelId: newModelId,
					ocaLiteLlmModelInfo: ocaModels[newModelId],
				})
			}
		}
	}

	const onAcknowledge = () => {
		if (pendingModelId && ocaModels) {
			handleFieldsChange({
				ocaLiteLlmModelId: pendingModelId,
				ocaLiteLlmModelInfo: ocaModels[pendingModelId],
			})
			setPendingModelId(null)
			setShowRestrictedPopup(false)
		}
	}

	const handleRefreshToken = async () => {
		await refreshOcaModels()
	}

	const { selectedModelId, selectedModelInfo } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration)
	}, [apiConfiguration])

	useMount(() => {
		ModelsServiceClient.refreshOcaModels(EmptyRequest.create({}))
			.then((response) => {
				setOcaModels(response.models)
			})
			.catch((err) => {
				console.error("Failed to refresh Oca models:", err)
			})
	})

	const modelIds = useMemo(() => {
		return Object.keys(ocaModels || []).sort((a, b) => a.localeCompare(b))
	}, [ocaModels])

	const showBudgetSlider = useMemo(() => {
		if (ocaModels && selectedModelId && ocaModels[selectedModelId]?.thinkingConfig) {
			return true
		}
	}, [selectedModelId])

	return (
		<div style={{ width: "100%" }}>
			{showRestrictedPopup && (
				<OcaRestrictivePopup
					onAcknowledge={onAcknowledge}
					bannerText={ocaModels && pendingModelId && ocaModels[pendingModelId]?.bannerContent}
				/>
			)}
			<label
				style={{
					fontWeight: 500,
					fontSize: 12,
					margin: "12px 0",
					display: "flex",
					flexDirection: "column",
					gap: 4,
				}}>
				<span>Please Select Model</span>
				<span>(Leave blank for default):</span>
			</label>
			<VSCodeDropdown
				id="model-id"
				value={selectedModelId}
				onChange={(event) => {
					const target = event.target as HTMLSelectElement | null
					const value = target?.value
					if (value) {
						handleModelChange(value)
					}
				}}
				style={{ width: "100%", fontSize: 13, minHeight: 27 }}>
				{modelIds.map((model) => (
					<VSCodeOption
						key={model}
						value={model}
						style={{
							whiteSpace: "normal",
							wordWrap: "break-word",
							maxWidth: "100%",
							fontSize: 13,
						}}>
						{model}
					</VSCodeOption>
				))}
			</VSCodeDropdown>
			<VSCodeButton
				style={{
					fontSize: 14,
					borderRadius: 22,
					fontWeight: 500,
					background: "var(--vscode-button-background, #0078d4)",
					color: "var(--vscode-button-foreground, #fff)",
					minWidth: 0,
					margin: "12px 0",
				}}
				onClick={handleRefreshToken}>
				Refresh
			</VSCodeButton>
			{selectedModelInfo && (
				<>
					{showBudgetSlider && <ThinkingBudgetSlider />}
					<ModelInfoView selectedModelId={selectedModelId} modelInfo={selectedModelInfo} isPopup={isPopup} />
				</>
			)}
		</div>
	)
}

export default OcaModelPicker

const OcaRestrictivePopup: React.FC<{
	onAcknowledge: () => void
	bannerText?: string | null
}> = React.memo(({ onAcknowledge, bannerText }) => (
	<div
		style={{
			position: "fixed",
			top: 0,
			left: 0,
			width: "100vw",
			height: "100vh",
			zIndex: 2000,
			background: "rgba(0,0,0,0.25)", // VSCode doesn't expose overlay, this works well for all themes
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
		}}>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="oca-popup-title"
			style={{
				padding: 24,
				maxWidth: 600,
				width: "90%",
				borderRadius: 8,
				boxShadow: "0 4px 24px 0 var(--vscode-widget-shadow,rgba(0,0,0,.4))",
				border: "1px solid var(--vscode-focusBorder, #007acc)",
				background: "var(--vscode-editorWidget-background, #252526)",
				color: "var(--vscode-editorWidget-foreground, #cccccc)",
				fontFamily: "var(--vscode-font-family, sans-serif)",
				fontSize: "var(--vscode-font-size, 13px)",
				display: "flex",
				flexDirection: "column",
				maxHeight: "80vh",
			}}>
			<h2
				id="oca-popup-title"
				style={{
					marginTop: 0,
					color: "var(--vscode-editorWidget-foreground, #f3f3f3)",
					fontWeight: "bold",
				}}>
				Acknowledgement Required
			</h2>
			<h4
				style={{
					marginBottom: 8,
					color: "var(--vscode-descriptionForeground, #b3b3b3)",
					fontWeight: 600,
				}}>
				Disclaimer: Prohibited Data Submission
			</h4>
			<div
				style={{
					overflowY: "auto",
					flex: 1,
					paddingRight: 8,
					marginBottom: 16,
					fontSize: 13,
					lineHeight: 1.5,
					color: "var(--vscode-editorWidget-foreground, #cccccc)",
					// Fade for long content
					maskImage: "linear-gradient(to bottom, black 96%, transparent 100%)",
				}}>
				{bannerText && (
					<div
						style={{
							wordBreak: "break-word",
							background: "var(--vscode-editorWidget-background, #252526)",
							color: "var(--vscode-editorWidget-background, #cccccc)",
						}}
						dangerouslySetInnerHTML={{ __html: bannerText }}
					/>
				)}
			</div>
			<div style={{ textAlign: "right" }}>
				<VSCodeButton type="button" onClick={onAcknowledge}>
					I acknowledge and agree
				</VSCodeButton>
			</div>
		</div>
	</div>
))
