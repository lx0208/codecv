const SIDEBAR_TOOLS_CONFIG_URL = "/public/feature-list-template.json";

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function appendRequiredIndicator(label, field) {
  if (!field.required) return;
  const indicator = createElement("span", "dashboard-form__required", " *");
  indicator.setAttribute("aria-label", "必須");
  label.append(indicator);
}

async function loadSidebarToolsConfig() {
  const response = await fetch(SIDEBAR_TOOLS_CONFIG_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`設定ファイルを読み込めませんでした (${response.status})`);
  }
  return response.json();
}

function createFormField(field) {
  if (field.type === "checkbox-group" || field.type === "radio-group") {
    const group = createElement("fieldset", "dashboard-form__group");
    const legend = createElement("legend", null, field.label);
    appendRequiredIndicator(legend, field);
    group.setAttribute("aria-required", String(Boolean(field.required)));
    group.append(legend);

    const options = createElement("div", "dashboard-form__checkboxes");
    for (const option of field.options || []) {
      const label = createElement("label", "dashboard-form__checkbox");
      const input = document.createElement("input");
      input.type = field.type === "radio-group" ? "radio" : "checkbox";
      input.name = field.name;
      input.value = option.value;

      const caption = createElement("span", null, option.label);
      label.append(input, caption);
      options.append(label);
    }

    group.append(options);
    return group;
  }

  const wrapper = createElement("div", "dashboard-form__field");
  const id = `dashboard-field-${field.name}`;
  const label = createElement("label", null, field.label);
  label.htmlFor = id;
  appendRequiredIndicator(label, field);

  let input;
  if (field.type === "textarea") {
    input = document.createElement("textarea");
    input.rows = field.rows || 4;
  } else if (field.type === "select") {
    input = document.createElement("select");
    for (const option of field.options || []) {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      input.append(optionElement);
    }
  } else {
    input = document.createElement("input");
    input.type = field.inputType || "text";
    input.autocomplete = field.autocomplete || "off";
  }

  input.id = id;
  input.name = field.name;
  input.required = Boolean(field.required);
  if ("placeholder" in input) input.placeholder = field.placeholder || "";

  wrapper.append(label, input);
  return wrapper;
}

function collectFormValues(form, fields) {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.type === "checkbox-group") {
        const checked = form.querySelectorAll(
          `input[name="${field.name}"]:checked`,
        );
        const value = Array.from(checked, (input) => input.value).join("、");
        return [field.name, value];
      }

      if (field.type === "radio-group") {
        const checked = form.querySelector(`input[name="${field.name}"]:checked`);
        return [field.name, checked?.value || ""];
      }

      const input = form.elements.namedItem(field.name);
      const isFormControl =
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement ||
        input instanceof HTMLSelectElement;
      return [field.name, isFormControl ? input.value.trim() : ""];
    }),
  );
}

function validateChoiceGroups(form, fields) {
  for (const field of fields) {
    const isChoiceGroup =
      field.type === "checkbox-group" || field.type === "radio-group";
    if (!isChoiceGroup || !field.required) continue;

    const inputs = form.querySelectorAll(`input[name="${field.name}"]`);
    const firstInput = inputs[0];
    const hasSelection = Array.from(inputs).some((input) => input.checked);
    const requirement =
      field.type === "radio-group" ? "選択してください。" : "1つ以上選択してください。";
    firstInput?.setCustomValidity(
      hasSelection ? "" : `${field.label}を${requirement}`,
    );

    if (!hasSelection) {
      form.reportValidity();
      firstInput?.focus();
      return false;
    }
  }
  return true;
}

function buildPrompt(template, values, fields) {
  const emptyOptionalFields = new Set(
    fields
      .filter((field) => !field.required && !values[field.name])
      .map((field) => field.name),
  );

  const includedLines = template.split(/\r?\n/).filter((line) => {
    const placeholders = Array.from(
      line.matchAll(/{{\s*([\w-]+)\s*}}/g),
      (match) => match[1],
    );
    return !placeholders.some((name) => emptyOptionalFields.has(name));
  });

  return includedLines
    .join("\n")
    .replace(/{{\s*([\w-]+)\s*}}/g, (_, name) => values[name] || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temporaryInput = document.createElement("textarea");
  temporaryInput.value = text;
  temporaryInput.style.position = "fixed";
  temporaryInput.style.opacity = "0";
  document.body.append(temporaryInput);
  temporaryInput.select();
  const copied = document.execCommand("copy");
  temporaryInput.remove();
  if (!copied) throw new Error("コピーに失敗しました");
}

function renderToolForm(container, titleElement, sidebarConfig, tool) {
  const config = tool.form;
  if (!config) {
    container.replaceChildren(
      createElement("p", "dashboard-form__error", "フォームが設定されていません。"),
    );
    return;
  }

  titleElement.textContent = tool.title;
  const form = createElement("form", "dashboard-form");
  const formHeader = createElement("div", "dashboard-form__header");
  const backButton = createElement(
    "button",
    "dashboard-form__back",
    sidebarConfig.backLabel || "← ツール一覧",
  );
  backButton.type = "button";
  backButton.addEventListener("click", () =>
    renderSidebarLauncher(container, titleElement, sidebarConfig),
  );
  const heading = createElement("h3", "dashboard-form__title", config.title || tool.title);
  formHeader.append(backButton, heading);
  form.append(formHeader);

  for (const field of config.fields || []) {
    form.append(createFormField(field));
  }

  const submitButton = createElement(
    "button",
    "dashboard-form__submit",
    config.submitLabel || "プロンプト作成",
  );
  submitButton.type = "submit";
  form.append(submitButton);

  const promptArea = createElement("section", "dashboard-prompt");
  promptArea.hidden = true;
  const promptHeader = createElement("div", "dashboard-prompt__header");
  const promptTitle = createElement(
    "h3",
    "dashboard-prompt__title",
    config.promptTitle || "生成されたプロンプト",
  );
  const copyButton = createElement(
    "button",
    "dashboard-prompt__copy",
    config.copyLabel || "コピー",
  );
  copyButton.type = "button";
  const promptOutput = createElement("pre", "dashboard-prompt__output");
  promptOutput.tabIndex = 0;
  const copyStatus = createElement("span", "dashboard-prompt__copy-status");
  copyStatus.setAttribute("aria-live", "polite");

  promptHeader.append(promptTitle, copyButton);
  promptArea.append(promptHeader, promptOutput, copyStatus);
  container.replaceChildren(form, promptArea);

  form.addEventListener("change", (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      event.target.setCustomValidity("");
      if (event.target.type === "checkbox" || event.target.type === "radio") {
        for (const input of form.querySelectorAll(
          'input[type="checkbox"], input[type="radio"]',
        )) {
          if (input.name === event.target.name) input.setCustomValidity("");
        }
      }
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validateChoiceGroups(form, config.fields || [])) return;

    const values = collectFormValues(form, config.fields || []);
    promptOutput.textContent = buildPrompt(
      config.promptTemplate || "",
      values,
      config.fields || [],
    );
    promptArea.hidden = false;
    promptArea.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  copyButton.addEventListener("click", async () => {
    try {
      await copyText(promptOutput.textContent);
      copyStatus.textContent = config.copiedLabel || "コピーしました。";
    } catch (error) {
      copyStatus.textContent = error.message;
    }

    window.setTimeout(() => {
      copyStatus.textContent = "";
    }, 2000);
  });
}

async function renderSidebarLauncher(container, titleElement, loadedConfig) {
  container.replaceChildren(
    createElement("p", "dashboard-form__status", "ツールを読み込んでいます…"),
  );

  try {
    const config = loadedConfig || (await loadSidebarToolsConfig());
    titleElement.textContent = config.sidebarTitle || "ツール";

    const description = createElement(
      "p",
      "custom-sidebar__description",
      config.description || "使用するツールを選択してください。",
    );
    const toolList = createElement("div", "custom-sidebar__launchers");

    for (const tool of config.tools || []) {
      const button = createElement("button", "custom-sidebar__launcher");
      button.type = "button";
      button.disabled = tool.enabled === false || !tool.form;

      const name = createElement("strong", "custom-sidebar__launcher-title", tool.title);
      button.append(name);
      if (tool.description) {
        button.append(
          createElement("span", "custom-sidebar__launcher-description", tool.description),
        );
      }
      if (button.disabled) {
        button.append(
          createElement(
            "span",
            "custom-sidebar__launcher-status",
            tool.disabledLabel || config.disabledLabel || "準備中",
          ),
        );
      } else {
        button.addEventListener("click", () =>
          renderToolForm(container, titleElement, config, tool),
        );
      }
      toolList.append(button);
    }

    container.replaceChildren(description, toolList);
  } catch (error) {
    container.replaceChildren(
      createElement(
        "p",
        "dashboard-form__error",
        error instanceof Error ? error.message : "設定を読み込めませんでした。",
      ),
    );
  }
}

function initializeCustomSidebar() {
  if (document.querySelector("#custom-sidebar")) return;

  document.documentElement.classList.add("custom-js-ready");

  const trigger = createElement("button", null, "☰");
  trigger.id = "custom-sidebar-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-controls", "custom-sidebar");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "ツールを開く");
  trigger.title = "ツールを開く";

  const backdrop = createElement("div");
  backdrop.id = "custom-sidebar-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const sidebar = createElement("aside");
  sidebar.id = "custom-sidebar";
  sidebar.setAttribute("aria-hidden", "true");
  sidebar.setAttribute("aria-labelledby", "custom-sidebar-title");
  sidebar.innerHTML = `
    <header class="custom-sidebar__header">
      <h2 id="custom-sidebar-title">ツール</h2>
      <button
        id="custom-sidebar-close"
        class="custom-sidebar__close"
        type="button"
        aria-label="右サイドバーを閉じる"
        title="閉じる"
      >×</button>
    </header>
    <div class="custom-sidebar__content"></div>
  `;

  document.body.append(backdrop, sidebar, trigger);

  const closeButton = sidebar.querySelector("#custom-sidebar-close");
  const content = sidebar.querySelector(".custom-sidebar__content");
  const titleElement = sidebar.querySelector("#custom-sidebar-title");
  renderSidebarLauncher(content, titleElement);

  function openSidebar() {
    sidebar.classList.add("is-open");
    backdrop.classList.add("is-open");
    document.body.classList.add("custom-sidebar-open");
    sidebar.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    closeButton.focus();
  }

  function closeSidebar() {
    sidebar.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.body.classList.remove("custom-sidebar-open");
    sidebar.setAttribute("aria-hidden", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  }

  trigger.addEventListener("click", openSidebar);
  closeButton.addEventListener("click", closeSidebar);
  backdrop.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
      closeSidebar();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeCustomSidebar, {
    once: true,
  });
} else {
  initializeCustomSidebar();
}
