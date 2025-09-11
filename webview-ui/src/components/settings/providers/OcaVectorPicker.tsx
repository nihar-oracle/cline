import type { ApiConfiguration } from "@shared/api"
import { VectorStoreInfo } from "@shared/proto/index.cline"
import { Mode } from "@shared/storage/types"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useEffect, useMemo, useRef, useState } from "react"
// import { normalizeApiConfiguration } from "../utils/providerUtils"
// import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

export interface OcaVectorPickerProps {
	apiConfiguration: ApiConfiguration | undefined
	isPopup?: boolean
	currentMode: Mode
	ocaKbs: Record<string, VectorStoreInfo>
	onRefresh: () => void | Promise<void>
}

const OcaVectorPicker: React.FC<OcaVectorPickerProps> = ({
	// apiConfiguration,
	// isPopup,
	// currentMode,
	ocaKbs,
	onRefresh,
}: OcaVectorPickerProps) => {
	// const { handleModeFieldsChange } = useApiConfigurationHandlers()

	// const handleVectorChange = async (newModelId: string) => {
	// 	await handleModeFieldsChange(
	// 		{
	// 			ocaModelId: { plan: "planModeOcaModelId", act: "actModeOcaModelId" },
	// 			ocaModelInfo: { plan: "planModeOcaModelInfo", act: "actModeOcaModelInfo" },
	// 		},
	// 		{
	// 			ocaModelId: newModelId,
	// 			ocaModelInfo: ocaModels[newModelId],
	// 		},
	// 		currentMode,
	// 	)
	// }

	const kbIds = useMemo(() => {
		return Object.keys(ocaKbs || []).sort((a, b) => a.localeCompare(b))
	}, [ocaKbs])

	const handleRefreshToken = async () => {
		await onRefresh?.()
	}

	return (
		<div className="w-full">
			<label className="font-medium text-[12px] mt-[10px] mb-[2px]">Knowledge Base</label>
			<MultiSelectDropdown
				options={kbIds.map((kbId) => {
					return ocaKbs[kbId].name
				})}
			/>
			<VSCodeButton
				onClick={handleRefreshToken}
				style={{
					fontSize: 14,
					borderRadius: 22,
					fontWeight: 500,
					background: "var(--vscode-button-background, #0078d4)",
					color: "var(--vscode-button-foreground, #fff)",
					minWidth: 0,
					margin: "12px 0",
				}}>
				Refresh
			</VSCodeButton>
		</div>
	)
}

export default OcaVectorPicker

const MultiSelectDropdown: React.FC<{ options: string[] }> = ({ options }) => {
	const [open, setOpen] = useState<boolean>(false)
	const [selected, setSelected] = useState<string[]>([])
	const wrapperRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [])

	const toggleOption = (option: string) => {
		setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]))
	}

	const selectedLabel = selected.length === 0 ? "Select options..." : selected.join(", ")

	return (
		<div
			ref={wrapperRef}
			style={{
				position: "relative",
				width: "100%",
				maxWidth: 280,
				marginBottom: 8,
			}}>
			{/* VSCode style dropdown button */}
			<div
				aria-expanded={open}
				aria-haspopup="listbox"
				onClick={() => setOpen((o) => !o)}
				onKeyDown={(e) => {
					if (e.key === " " || e.key === "Enter") {
						setOpen((o) => !o)
					}
					if (e.key === "Escape") {
						setOpen(false)
					}
				}}
				style={{
					display: "flex",
					alignItems: "center",
					border: "1px solid var(--vscode-dropdown-border, #3c3c3c)",
					borderRadius: 4,
					background: "var(--vscode-dropdown-background, #1e1e1e)",
					color: "var(--vscode-dropdown-foreground, #cccccc)",
					minHeight: 28,
					minWidth: 0,
					paddingLeft: 12,
					paddingRight: 8,
					cursor: "pointer",
					fontSize: 13,
					fontFamily: "var(--vscode-font-family, inherit)",
					boxSizing: "border-box",
					position: "relative",
					outline: open ? "2px solid var(--vscode-focusBorder, #0078d4)" : "none",
				}}
				tabIndex={0}>
				<span
					style={{
						overflow: "hidden",
						whiteSpace: "nowrap",
						textOverflow: "ellipsis",
						userSelect: "none",
						flex: 1,
					}}
					title={selectedLabel}>
					{selectedLabel}
				</span>
				<svg height="16" style={{ marginLeft: 6, fill: "currentColor" }} width="16">
					<path d="M4.5 7l3.5 3 3.5-3z" />
				</svg>
			</div>

			{open && (
				<div
					role="listbox"
					style={{
						position: "absolute",
						top: 32,
						left: 0,
						width: "100%",
						minWidth: 120,
						zIndex: 1000,
						background: "var(--vscode-dropdown-background, #1e1e1e)",
						border: "1px solid var(--vscode-dropdown-border, #3c3c3c)",
						borderRadius: 4,
						boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
						color: "var(--vscode-dropdown-foreground, #cccccc)",
						fontSize: 13,
						fontFamily: "var(--vscode-font-family, inherit)",
						marginTop: 2,
						padding: 4,
					}}>
					{options.map((option) => {
						const checked = selected.includes(option)
						return (
							<div
								aria-selected={checked}
								key={option}
								onClick={(e) => {
									e.stopPropagation()
									toggleOption(option)
								}}
								onKeyDown={(e) => {
									if (e.key === " " || e.key === "Enter") {
										toggleOption(option)
									}
								}}
								role="option"
								style={{
									display: "flex",
									alignItems: "center",
									padding: "5px 8px",
									borderRadius: 3,
									cursor: "pointer",
									background: checked ? "var(--vscode-list-activeSelectionBackground, #094771)" : "transparent",
									color: checked
										? "var(--vscode-list-activeSelectionForeground, #fff)"
										: "var(--vscode-dropdown-foreground, #cccccc)",
								}}
								tabIndex={0}>
								<input
									checked={checked}
									readOnly
									style={{
										accentColor: "var(--vscode-checkbox-foreground, #0078d4)",
										marginRight: 8,
									}}
									tabIndex={-1}
									type="checkbox"
								/>
								<span style={{ flex: 1 }}>{option}</span>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
