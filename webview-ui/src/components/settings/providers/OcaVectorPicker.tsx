import type { ApiConfiguration } from "@shared/api"
import { VectorStoreInfo } from "@shared/proto/index.cline"
import { Mode } from "@shared/storage/types"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

export interface OcaVectorPickerProps {
	apiConfiguration: ApiConfiguration | undefined
	currentMode: Mode
	ocaKbs: Record<string, VectorStoreInfo>
	onRefresh: () => void | Promise<void>
}

const OcaVectorPicker: React.FC<OcaVectorPickerProps> = ({
	apiConfiguration,
	currentMode,
	ocaKbs,
	onRefresh,
}: OcaVectorPickerProps) => {
	const { handleModeFieldChange } = useApiConfigurationHandlers()

	const handleKbChange = async (kbs: string[]) => {
		await handleModeFieldChange({ plan: "planModeOcaVectorIds", act: "actModeOcaVectorIds" }, kbs, currentMode)
	}

	const kbIds = useMemo(() => {
		const a = () => Object.keys(ocaKbs || []).sort((a, b) => ocaKbs[a].name.localeCompare(ocaKbs[b].name))
		return a().concat(a()).concat(a()).concat(a()).concat(a()).concat(a()).concat(a())
	}, [ocaKbs])

	const { selectedVectorIds } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration, currentMode)
	}, [apiConfiguration, currentMode])

	const handleRefreshToken = async () => {
		await onRefresh?.()
	}

	const toggleOption = async (option: { id: string; name: string }) => {
		const prevVectorIds = selectedVectorIds || []
		const newVectorIds = prevVectorIds.includes(option.id)
			? prevVectorIds.filter((o) => o !== option.id)
			: [...prevVectorIds, option.id]
		await handleKbChange(newVectorIds)
	}

	return (
		<div className="w-full">
			<label className="font-medium text-[12px] mt-[10px] mb-[2px]">Knowledge Base</label>
			<MultiSelectDropdown
				options={kbIds.map((kbId) => {
					return {
						id: kbId,
						name: ocaKbs[kbId].name,
					}
				})}
				selectedIds={selectedVectorIds || []}
				toggleOption={toggleOption}
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

interface MultiSelectDropdownProps {
	options: {
		id: string
		name: string
	}[]
	selectedIds: string[]
	toggleOption: (option: { id: string; name: string }) => Promise<void>
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ options, selectedIds, toggleOption }) => {
	const [open, setOpen] = useState<boolean>(false)
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

	console.log("Selected IDS: ", selectedIds)
	console.log("Options: ", options)

	const selectedLabel =
		selectedIds.length === 0 || options.length === 0
			? "Select options..."
			: selectedIds.map((selectedId) => options.filter((option) => selectedId === option.id)[0].name).join(", ")

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
						maxHeight: 200,
						overflowY: "auto",
					}}>
					{options.map((option) => {
						const checked = selectedIds.includes(option.id)
						return (
							<div
								aria-selected={checked}
								key={option.id}
								onClick={async (e) => {
									e.stopPropagation()
									await toggleOption(option)
								}}
								onKeyDown={async (e) => {
									if (e.key === " " || e.key === "Enter") {
										await toggleOption(option)
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
								<span style={{ flex: 1 }}>{option.name}</span>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
