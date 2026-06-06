import { App, Modal, Setting } from "obsidian";

/**
 * Minimal single-field prompt used by the local-auth "join shared folder" flow
 * (Option A) to collect a shared-folder id. Kept deliberately small — it only
 * exists for the MVP until real discovery (M2) replaces RelayManager.
 */
export class GuidPromptModal extends Modal {
	private value = "";

	constructor(
		app: App,
		private titleText: string,
		private placeholder: string,
		private onSubmit: (value: string) => void,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.titleText });
		contentEl.createEl("p", {
			text: "Paste the shared-folder ID shown when the other vault shared it.",
		});

		new Setting(contentEl).setName("Shared-folder ID").addText((text) => {
			text
				.setPlaceholder(this.placeholder)
				.onChange((v) => (this.value = v.trim()));
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.submit();
				}
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Join")
				.setCta()
				.onClick(() => this.submit()),
		);
	}

	private submit() {
		if (!this.value) return;
		this.close();
		this.onSubmit(this.value);
	}

	onClose() {
		this.contentEl.empty();
	}
}
