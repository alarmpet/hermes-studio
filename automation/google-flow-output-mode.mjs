import {
  flowChipClassifierBrowserSource,
  isAgentChip,
} from "./google-flow-chip-classifier.mjs";

const LABELS = {
  image: ["이미지", "image"],
  video: ["동영상", "video"],
  agentOff: ["\uc548\ud568", "\uc0ac\uc6a9 \uc548\ud568", "none", "off", "disabled"],
  imageSection: ["이미지 생성 기본값", "image generation"],
  videoSection: ["동영상 생성 기본값", "video generation"],
  imageModel: ["Nano Banana Pro"],
  imageModelDropdown: ["Nano Banana Pro", "Imagen 4", "Nano Banana 2", "Nano Banana"],
  videoModel: ["Veo 3.1 - Lite", "Veo"],
  aspect: ["9:16", "crop_9_16"],
  landscapeAspect: ["16:9", "crop_16_9"],
  count: ["1x"],
};

const IMAGE_MODEL_LABELS = {
  "nano-banana-pro": ["Nano Banana Pro"],
  "nano-banana-2": ["Nano Banana 2"],
  imagen: ["Imagen 4"],
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function configureFlowOutputMode(page, outputMode = "video", aspectRatio = "9:16", options = {}) {
  if (outputMode === "image") return configureFlowImage(page, aspectRatio, options);
  return configureFlowVideo(page, aspectRatio);
}

export async function verifyFlowOutputMode(page, requestedOutputMode, aspectRatio = "9:16") {
  return page.evaluate(({ requested, requestedAspectRatio, classifierSource }) => {
    let chooseChip;
    try {
      ({ chooseFlowGeneratorChip: chooseChip } = Function(`${classifierSource}; return { chooseFlowGeneratorChip };`)());
    } catch (error) {
      return {
        requestedOutputMode: requested,
        selectedOutputMode: "unknown",
        selectedImageModel: "unknown",
        ok: false,
        failureCode: "FLOW_CHIP_CLASSIFIER_EVAL_FAILED",
        reason: `Browser-side classifier evaluation crash: ${error?.message || error}`,
        stack: error?.stack || "",
        bottomGeneratorChip: [],
        textTail: document.body?.innerText?.slice(-1500) || "",
      };
    }
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const bottomGeneratorChip = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          label: textOf(el),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.y > window.innerHeight * 0.64);

    const selectedChip = chooseChip(bottomGeneratorChip);
    const selectedChipLabel = selectedChip?.label || "";
    const fullText = document.body?.innerText || "";
    const modeText = selectedChipLabel;
    const selectedOutputMode = /Veo|video|\ub3d9\uc601\uc0c1|00:10:00|videocam/i.test(modeText)
      ? "video"
      : /\uc774\ubbf8\uc9c0|image|Nano Banana|Imagen/i.test(modeText)
        ? "image"
        : "unknown";
    const selectedImageModel = /Nano Banana Pro/i.test(modeText)
      ? "nano-banana-pro"
      : /Nano Banana 2/i.test(modeText)
        ? "nano-banana-2"
        : /Nano Banana/i.test(modeText)
          ? "nano-banana"
          : /Imagen/i.test(modeText)
            ? "imagen"
            : "unknown";
    const imageModelOk = requested !== "image" || selectedImageModel !== "unknown";
    const generatorMenuOpen = /crop_landscape|crop_square|crop_portrait|crop_9_16|Nano Banana Pro\s*arrow_drop_down|credits|credit/i.test(fullText);

    return {
      requestedOutputMode: requested,
      requestedAspectRatio,
      selectedOutputMode,
      selectedImageModel,
      selectedAspectRatio: /16:9|crop_16_9/i.test(selectedChipLabel) ? "16:9" : "9:16",
      selectedChip: selectedChip ? {
        label: selectedChip.label,
        score: selectedChip._score,
        x: selectedChip.x,
        y: selectedChip.y,
        width: selectedChip.width,
        height: selectedChip.height,
      } : null,
      generatorMenuOpen,
      ok: selectedOutputMode === requested && imageModelOk && !generatorMenuOpen,
      bottomGeneratorChip,
      textTail: fullText.slice(-1500),
    };
  }, { requested: requestedOutputMode, requestedAspectRatio: aspectRatio, classifierSource: flowChipClassifierBrowserSource() });
}

async function configureFlowVideo(page, aspectRatio = "9:16") {
  return configureFlowGenerator(page, {
    requestedOutputMode: "video",
    targetLabels: LABELS.video,
    sectionLabels: LABELS.videoSection,
    generatorLabels: LABELS.videoModel,
    aspectLabels: aspectRatio === "16:9" ? LABELS.landscapeAspect : LABELS.aspect,
    countLabels: LABELS.count,
  });
}

async function configureFlowImage(page, aspectRatio = "9:16", options = {}) {
  const requestedImageModel = IMAGE_MODEL_LABELS[options.flowImageModel] ? options.flowImageModel : "nano-banana-pro";
  return configureFlowGenerator(page, {
    requestedOutputMode: "image",
    targetLabels: LABELS.image,
    sectionLabels: LABELS.imageSection,
    modelDropdownLabels: LABELS.imageModelDropdown,
    generatorLabels: IMAGE_MODEL_LABELS[requestedImageModel],
    requestedImageModel,
    modelRequired: true,
    aspectLabels: aspectRatio === "16:9" ? LABELS.landscapeAspect : LABELS.aspect,
    countLabels: LABELS.count,
    countRequired: true,
    agentModeOffRequired: true,
  });
}

async function configureFlowGenerator(page, config) {
  const disableAgentMode = () => page.evaluate(async ({ offLabels }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const bottomButtons = () => Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          el,
          text: textOf(el),
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          rect,
        };
      })
      .filter((item) => item.y > window.innerHeight * 0.64);
    const agentChip = bottomButtons()
      .filter((item) => /agent|agentic|\uc5d0\uc774\uc804\ud2b8/i.test(item.text))
      .filter((item) => !/article_spark|request|\uc694\uccad/i.test(item.text))
      .sort((a, b) => {
        const whiteA = getComputedStyle(a.el).backgroundColor || "";
        const whiteB = getComputedStyle(b.el).backgroundColor || "";
        const scoreA = /255|248|245|240/.test(whiteA) ? 1 : 0;
        const scoreB = /255|248|245|240/.test(whiteB) ? 1 : 0;
        return scoreB - scoreA || b.width - a.width || a.x - b.x;
      })[0];
    if (!agentChip) {
      return {
        ok: false,
        reason: "agent chip not found",
        bottomButtons: bottomButtons().slice(0, 12).map(({ el, rect, ...item }) => item),
      };
    }
    agentChip.el.click();
    await sleep(600);
    const lowerOffLabels = offLabels.map((label) => String(label || "").toLowerCase());
    const options = Array.from(document.querySelectorAll("button,[role='button'],[role='option']"))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          el,
          text: textOf(el),
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          distance: Math.abs((rect.x + rect.width / 2) - agentChip.x) + Math.abs((rect.y + rect.height / 2) - agentChip.y),
        };
      })
      .filter((item) => lowerOffLabels.some((label) => item.text.toLowerCase().includes(label)))
      .filter((item) => item.y > window.innerHeight * 0.45)
      .sort((a, b) => a.distance - b.distance || a.y - b.y);
    const offOption = options[0];
    const postClickModelChip = bottomButtons()
      .filter((item) => /Nano Banana|Imagen|Veo|crop_16_9|crop_9_16|1x/i.test(item.text))
      .filter((item) => !/agent|agentic|\uc5d0\uc774\uc804\ud2b8|article_spark|request/i.test(item.text))
      .sort((a, b) => b.width - a.width || a.x - b.x)[0];
    if (!offOption && postClickModelChip) {
      const { el, ...agentChipInfo } = agentChip;
      const { el: modelEl, ...postClickModelChipInfo } = postClickModelChip;
      return {
        ok: true,
        agentModeOff: true,
        reason: "agent selector clicked and model chip became active",
        agentChip: agentChipInfo,
        postClickModelChip: postClickModelChipInfo,
      };
    }
    if (!offOption) {
      return {
        ok: false,
        reason: "agent off option not found",
        agentChip: (({ el, rect, ...item }) => item)(agentChip),
        visibleOptions: Array.from(document.querySelectorAll("button,[role='button'],[role='option']"))
          .filter(visible)
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              text: textOf(el),
              x: Math.round(rect.x + rect.width / 2),
              y: Math.round(rect.y + rect.height / 2),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          .filter((item) => item.y > window.innerHeight * 0.45)
          .slice(0, 20),
      };
    }
    offOption.el.click();
    await sleep(600);
    const { el, ...agentChipInfo } = agentChip;
    const { el: offEl, ...offOptionInfo } = offOption;
    return {
      ok: true,
      agentModeOff: true,
      agentChip: agentChipInfo,
      offOption: offOptionInfo,
    };
  }, { offLabels: LABELS.agentOff });
  const findBottomGeneratorChip = () => page.evaluate((classifierSource) => {
    try {
      const {
        chooseFlowGeneratorChip: chooseChip,
        rejectedFlowChipReasons: rejectedReasons,
      } = Function(`${classifierSource}; return { chooseFlowGeneratorChip, rejectedFlowChipReasons };`)();
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return !el.disabled
          && el.getAttribute("aria-disabled") !== "true"
          && style.visibility !== "hidden"
          && style.display !== "none"
          && rect.width > 8
          && rect.height > 8;
      };
      const textOf = (el) => [
        el.innerText,
        el.textContent,
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const bottomItems = Array.from(document.querySelectorAll("button,[role='button']"))
        .filter(visible)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: textOf(el),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((item) => item.label && item.y > window.innerHeight * 0.64);
      const selected = chooseChip(bottomItems);
      const rejectedChipReasons = rejectedReasons(bottomItems);
      if (!selected) {
        return {
          ok: false,
          reason: "model/settings chip not found",
          bottomGeneratorChip: false,
          bottomButtons: bottomItems,
          rejectedChipReasons,
        };
      }
      const selectedChip = {
        label: selected.label,
        score: selected._score,
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
      };
      return {
        ok: true,
        text: selected.label,
        bottomGeneratorChip: true,
        selectedChip,
        rejectedChipReasons,
        bottomButtons: bottomItems,
        x: Math.round(selected.x + selected.width / 2),
        y: Math.round(selected.y + selected.height / 2),
      };
    } catch (error) {
      return {
        ok: false,
        reason: `Browser-side classifier evaluation crash: ${error?.message || error}`,
        failureCode: "FLOW_CHIP_CLASSIFIER_EVAL_FAILED",
        stack: error?.stack || "",
      };
    }
  }, flowChipClassifierBrowserSource());
  const findControl = (needles, options = {}) => page.evaluate(({ needles, options }) => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled
        && el.getAttribute("aria-disabled") !== "true"
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    function clickableAncestorOf(el) {
      return el.closest("button,[role='button'],[role='option']");
    }
    const labelContext = () => Array.from(document.querySelectorAll("button,[role='button'],[role='option'],[aria-label],div,span"))
      .filter(visible)
      .map((el) => {
        const clickable = clickableAncestorOf(el);
        return {
          el: clickable,
          text: textOf(el),
          rect: (clickable || el).getBoundingClientRect(),
          unsafe: !clickable,
        };
      })
      .filter((item) => item.text);
      if (!needles?.length) return { ok: true, skipped: true, optional: Boolean(options.optional) };
      const lowerNeedles = needles.map((needle) => needle.toLowerCase());
      const rejected = [];
      const matches = labelContext().filter((item) => {
        const text = item.text.toLowerCase();
        const matched = lowerNeedles.some((needle) => options.exact ? text === needle : text.includes(needle));
        if (!matched) return false;
        if (item.unsafe) {
          rejected.push({ text: item.text, reason: "non-clickable-label" });
          return false;
        }
        if (options.bottomPanel && item.rect.y < window.innerHeight * 0.64) return false;
        if (options.generatorMenuOnly) {
          const inLeftSidebar = item.rect.x < window.innerWidth * 0.18;
          if (inLeftSidebar) {
            rejected.push({ text: item.text, reason: "sidebar" });
            return false;
          }
          if (item.rect.width > 420 || item.rect.height > 120) {
            rejected.push({ text: item.text, reason: "oversized-container" });
            return false;
          }
        }
        if (Number.isFinite(options.minY) && item.rect.y < options.minY) return false;
        if (Number.isFinite(options.maxY) && item.rect.y > options.maxY) return false;
        if (options.requireArrowDropDown && !text.includes("arrow_drop_down")) return false;
        if ((options.excludeLabels || []).some((label) => text.includes(String(label || "").toLowerCase()))) {
          rejected.push({ text: item.text, reason: "excluded-label" });
          return false;
        }
        return true;
      }).sort((a, b) => {
        const aClickable = a.el.closest("button,[role='button'],[role='option']") ? 1 : 0;
        const bClickable = b.el.closest("button,[role='button'],[role='option']") ? 1 : 0;
        return bClickable - aClickable || (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
      });
      const match = matches[0];
      if (!match) {
        return {
          ok: Boolean(options.optional),
          optional: Boolean(options.optional),
          reason: `No control matched: ${needles.join(", ")}`,
          failureCode: "FLOW_UNSAFE_CLICK_TARGET",
          rejectedClickCandidates: rejected,
        };
      }
      return {
        ok: true,
        optional: Boolean(options.optional),
        text: match.text,
        x: Math.round(match.rect.x + match.rect.width / 2),
        y: Math.round(match.rect.y + match.rect.height / 2),
      };
    }, { needles, options });
  const pageSummary = () => page.evaluate(() => document.body?.innerText?.slice(-800) || "");
  const findSectionBounds = () => page.evaluate(({ currentLabels, otherLabels }) => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const matching = (labels) => {
      const lowered = labels.map((label) => String(label || "").toLowerCase()).filter(Boolean);
      return Array.from(document.querySelectorAll("button,[role='button'],[role='option'],[aria-label],div,span"))
        .filter(visible)
        .map((el) => ({ text: textOf(el), rect: el.getBoundingClientRect() }))
        .filter((item) => item.rect.x > window.innerWidth * 0.55)
        .filter((item) => item.rect.width < 420 && item.rect.height < 100)
        .filter((item) => lowered.some((label) => item.text.toLowerCase().includes(label)))
        .sort((a, b) => a.rect.y - b.rect.y);
    };
    const current = matching(currentLabels)[0];
    const others = matching(otherLabels).filter((item) => !current || Math.abs(item.rect.y - current.rect.y) > 20);
    const next = current ? others.find((item) => item.rect.y > current.rect.y) : null;
    const previous = current ? [...others].reverse().find((item) => item.rect.y < current.rect.y) : null;
    if (!current) return { ok: false, reason: "section heading not found" };
    return {
      ok: true,
      label: current.text,
      minY: Math.max(0, Math.round(current.rect.y - 8)),
      maxY: next
        ? Math.round(next.rect.y - 12)
        : Math.round(window.innerHeight - 40),
      previousY: previous ? Math.round(previous.rect.y) : null,
      nextY: next ? Math.round(next.rect.y) : null,
    };
  }, {
    currentLabels: config.sectionLabels || config.targetLabels || [],
    otherLabels: config.requestedOutputMode === "video" ? LABELS.imageSection : LABELS.videoSection,
  });
  const isAgentSettingsPanelOpen = () => page.evaluate(() => {
    const text = document.body?.innerText || "";
    return /에이전트 설정|Agent settings/i.test(text)
      && /이미지 생성 기본값|동영상 생성 기본값|image generation|video generation/i.test(text);
  });
  const clickSave = () => clickMatch(["\uc800\uc7a5", "save"], { generatorMenuOnly: true, optional: false, delay: 900 });

  const openBottomGeneratorChip = async () => {
    const target = await findBottomGeneratorChip();
    if (!target.ok) return target;
    await page.mouse.click(target.x, target.y);
    await delay(800);
    return target;
  };
  const clickMatch = async (needles, options = {}) => {
    const match = await findControl(needles, options);
    if (!match.ok) return match;
    if (!match.skipped && Number.isFinite(match.x) && Number.isFinite(match.y)) {
      await page.mouse.click(match.x, match.y);
      await delay(options.delay ?? 700);
    }
    return match;
  };
  const chipMatchesConfig = (label = "") => {
    const text = String(label || "");
    const modelOk = !config.generatorLabels?.length || config.generatorLabels.some((label) => text.toLowerCase().includes(String(label).toLowerCase()));
    const aspectOk = !config.aspectLabels?.length || config.aspectLabels.some((label) => text.toLowerCase().includes(String(label).toLowerCase()));
    const countOk = !config.countRequired || /1x/i.test(text);
    const modeOk = config.requestedOutputMode !== "image" || /Nano Banana|Imagen|image|\uc774\ubbf8\uc9c0/i.test(text);
    return modelOk && aspectOk && countOk && modeOk;
  };

  const results = [];
  if (config.agentModeOffRequired) {
    results.push(await disableAgentMode());
    await delay(500);
  }
  const initialChip = await findBottomGeneratorChip();
  results.push(initialChip);
  if (initialChip.ok && chipMatchesConfig(initialChip.text)) {
    const menuClosed = await closeFlowGeneratorMenu(page);
    const selectedModelResult = initialChip.ok && /Nano Banana|Imagen/i.test(initialChip.text || "") ? initialChip : null;
    const selectedAspectResult = initialChip.ok && /16:9|9:16|crop_16_9|crop_9_16/i.test(initialChip.text || "") ? initialChip : null;
    const selectedCountResult = initialChip.ok && /1x/i.test(initialChip.text || "") ? initialChip : null;
    const criticalResults = results.filter((item) => !item.optional);
    return {
      ok: criticalResults.every((item) => item.ok) && menuClosed.ok,
      requestedOutputMode: config.requestedOutputMode,
      requestedImageModel: config.requestedImageModel || "",
      selectedOutputMode: config.requestedOutputMode,
      selectedImageModelLabel: selectedModelResult?.text || "",
      selectedAspectLabel: selectedAspectResult?.text || "",
      selectedCountLabel: selectedCountResult?.text || "",
      settingsPanelApplied: false,
      bottomChipApplied: true,
      saved: false,
      menuClosed,
      results,
      selectedChip: initialChip.selectedChip,
      rejectedChipReasons: initialChip.rejectedChipReasons || [],
      summary: await pageSummary(),
    };
  }
  results.push(await openBottomGeneratorChip());
  const agentSettingsPanelOpen = await isAgentSettingsPanelOpen();
  if (agentSettingsPanelOpen) {
    results.push({
      ok: true,
      optional: false,
      text: "agent settings panel already open",
      skippedTargetMode: true,
    });
  } else {
    const targetResult = await clickMatch(config.targetLabels, { generatorMenuOnly: true });
    results.push(targetResult);
    if (!targetResult.ok) {
      return { ok: false, requestedOutputMode: config.requestedOutputMode, results, summary: await pageSummary() };
    }
    await delay(600);
  }
  const sectionBounds = await findSectionBounds();
  results.push({ ok: sectionBounds.ok, optional: false, sectionBounds });
  if (!sectionBounds.ok) {
    return { ok: false, requestedOutputMode: config.requestedOutputMode, results, summary: await pageSummary() };
  }
  const scoped = {
    generatorMenuOnly: true,
    minY: sectionBounds.minY,
    maxY: sectionBounds.maxY,
  };

  if (!agentSettingsPanelOpen) results.push(await openBottomGeneratorChip());
  if (config.modelDropdownLabels?.length) {
    const dropdownResult = await clickMatch(config.modelDropdownLabels, { ...scoped, requireArrowDropDown: true, optional: false });
    results.push(dropdownResult);
    if (!dropdownResult.ok) {
      return { ok: false, requestedOutputMode: config.requestedOutputMode, results, summary: await pageSummary() };
    }
    await delay(500);
  }
  results.push(await clickMatch(config.generatorLabels, { ...scoped, optional: !config.modelRequired, excludeLabels: config.excludeGeneratorLabels || [] }));
  await delay(300);

  if (!agentSettingsPanelOpen) results.push(await openBottomGeneratorChip());
  results.push(await clickMatch(config.aspectLabels, { ...scoped, optional: true }));
  await delay(300);

  if (!agentSettingsPanelOpen) results.push(await openBottomGeneratorChip());
  results.push(await clickMatch(config.countLabels, { ...scoped, exact: true, optional: !config.countRequired }));
  const saveResult = await clickSave();
  results.push({ ...saveResult, saveSettings: true });
  if (!saveResult.ok) await page.keyboard.press("Escape").catch(() => {});
  await delay(300);
  const menuClosed = await closeFlowGeneratorMenu(page);

  const criticalResults = results.filter((item) => !item.optional);
  const selectedModelResult = [...results].reverse().find((item) => item.ok && /Nano Banana|Imagen/i.test(item.text || ""));
  const selectedAspectResult = results.find((item) => item.ok && /16:9|9:16|crop_16_9|crop_9_16/i.test(item.text || ""));
  const selectedCountResult = results.find((item) => item.ok && /1x|1\s*(?:\uc7a5|image)/i.test(item.text || ""));
  return {
    ok: criticalResults.every((item) => item.ok) && menuClosed.ok,
    requestedOutputMode: config.requestedOutputMode,
    requestedImageModel: config.requestedImageModel || "",
    selectedImageModelLabel: selectedModelResult?.text || "",
    selectedAspectLabel: selectedAspectResult?.text || "",
    selectedCountLabel: selectedCountResult?.text || "",
    settingsPanelApplied: true,
    saved: saveResult.ok,
    menuClosed,
    sectionBounds,
    results,
    selectedChip: [...results].reverse().find((item) => item.selectedChip)?.selectedChip,
    rejectedChipReasons: results.flatMap((item) => item.rejectedChipReasons || []),
    summary: await pageSummary(),
  };
}

async function closeFlowGeneratorMenu(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await delay(400);
  await page.mouse.click(400, 200).catch(() => {});
  await delay(400);
  await page.evaluate(() => {
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
  }).catch(() => {});
  return verifyGeneratorMenuClosed(page);
}

export async function verifyGeneratorMenuClosed(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 8
        && rect.height > 8;
    };
    const text = Array.from(document.querySelectorAll("button,[role='button'],[role='option'],div,span"))
      .filter(visible)
      .map((el) => [
        el.innerText,
        el.textContent,
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim())
      .join("\n");
    const menuOpen = /crop_landscape|crop_square|crop_portrait|crop_9_16|Nano Banana Pro\s*arrow_drop_down|credits|credit/i.test(text);
    return {
      ok: !menuOpen,
      menuOpen,
      textTail: text.slice(-1200),
    };
  });
}
