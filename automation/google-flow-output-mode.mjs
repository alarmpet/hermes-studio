const LABELS = {
  image: ["\uc774\ubbf8\uc9c0", "image"],
  video: ["\ub3d9\uc601\uc0c1", "video"],
  imageModel: ["Nano Banana Pro"],
  imageModelDropdown: ["Imagen 4", "Nano Banana"],
  videoModel: ["Veo 3.1 - Lite", "Veo"],
  aspect: ["9:16", "crop_9_16"],
  count: ["1x"],
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function configureFlowOutputMode(page, outputMode = "video") {
  if (outputMode === "image") return configureFlowImage(page);
  return configureFlowVideo(page);
}

export async function verifyFlowOutputMode(page, requestedOutputMode) {
  return page.evaluate((requested) => {
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
      .filter((item) => item.y > window.innerHeight * 0.64 && item.x > window.innerWidth * 0.45);

    const bottomText = bottomGeneratorChip.map((item) => item.label).join("\n");
    const fullText = document.body?.innerText || "";
    const selectedOutputMode = /\uc774\ubbf8\uc9c0|image|Nano Banana|Imagen/i.test(bottomText)
      ? "image"
      : /\ub3d9\uc601\uc0c1|video|Veo|00:10:00|videocam/i.test(bottomText)
        ? "video"
        : "unknown";
    const selectedImageModel = /Nano Banana Pro/i.test(bottomText)
      ? "nano-banana-pro"
      : /Nano Banana/i.test(bottomText)
        ? "nano-banana"
        : /Imagen/i.test(bottomText)
          ? "imagen"
          : "unknown";
    const imageModelOk = requested !== "image" || selectedImageModel === "nano-banana-pro";

    return {
      requestedOutputMode: requested,
      selectedOutputMode,
      selectedImageModel,
      ok: selectedOutputMode === requested && imageModelOk,
      bottomGeneratorChip,
      textTail: fullText.slice(-1500),
    };
  }, requestedOutputMode);
}

async function configureFlowVideo(page) {
  return configureFlowGenerator(page, {
    requestedOutputMode: "video",
    targetLabels: LABELS.video,
    generatorLabels: LABELS.videoModel,
    aspectLabels: LABELS.aspect,
    countLabels: LABELS.count,
  });
}

async function configureFlowImage(page) {
  return configureFlowGenerator(page, {
    requestedOutputMode: "image",
    targetLabels: LABELS.image,
    modelDropdownLabels: LABELS.imageModelDropdown,
    generatorLabels: LABELS.imageModel,
    modelRequired: true,
    aspectLabels: LABELS.aspect,
    countLabels: LABELS.count,
  });
}

async function configureFlowGenerator(page, config) {
  const findBottomGeneratorChip = () => page.evaluate(() => {
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
    const controls = () => Array.from(document.querySelectorAll("button,[role='button'],[role='option'],[aria-label],div,span"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => item.text);
    const candidates = controls().filter((item) => {
      const text = item.text;
      return item.el.matches("button,[role='button']")
        && item.rect.y > window.innerHeight * 0.64
        && item.rect.x > window.innerWidth * 0.45
        && !/arrow_forward|create|generate|\ub9cc\ub4e4\uae30/i.test(text)
        && (item.rect.width > 48 || /\ub3d9\uc601\uc0c1|\uc774\ubbf8\uc9c0|video|image|Veo|Nano Banana|Imagen|1x|crop_9_16|9:16/i.test(text));
    }).sort((a, b) => {
      const aMode = /\ub3d9\uc601\uc0c1|\uc774\ubbf8\uc9c0|video|image/i.test(a.text) ? 1 : 0;
      const bMode = /\ub3d9\uc601\uc0c1|\uc774\ubbf8\uc9c0|video|image/i.test(b.text) ? 1 : 0;
      return bMode - aMode || (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height);
    });
    const target = candidates[0];
    if (!target) return { ok: false, reason: "bottom generator chip not found", bottomGeneratorChip: false };
    return {
      ok: true,
      text: target.text,
      bottomGeneratorChip: true,
      x: Math.round(target.rect.x + target.rect.width / 2),
      y: Math.round(target.rect.y + target.rect.height / 2),
    };
  });
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
    const controls = () => Array.from(document.querySelectorAll("button,[role='button'],[role='option'],[aria-label],div,span"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => item.text);
      if (!needles?.length) return { ok: true, skipped: true, optional: Boolean(options.optional) };
      const lowerNeedles = needles.map((needle) => needle.toLowerCase());
      const matches = controls().filter((item) => {
        const text = item.text.toLowerCase();
        const matched = lowerNeedles.some((needle) => options.exact ? text === needle : text.includes(needle));
        if (!matched) return false;
        if (options.bottomPanel && item.rect.y < window.innerHeight * 0.64) return false;
        if (options.generatorMenuOnly) {
          const inLeftSidebar = item.rect.x < window.innerWidth * 0.18;
          if (inLeftSidebar) return false;
        }
        if (options.requireArrowDropDown && !text.includes("arrow_drop_down")) return false;
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

  const results = [];
  results.push(await openBottomGeneratorChip());
  const targetResult = await clickMatch(config.targetLabels, { generatorMenuOnly: true });
  results.push(targetResult);
  if (!targetResult.ok) {
    return { ok: false, requestedOutputMode: config.requestedOutputMode, results, summary: await pageSummary() };
  }
  await delay(600);

  results.push(await openBottomGeneratorChip());
  if (config.modelDropdownLabels?.length) {
    const dropdownResult = await clickMatch(config.modelDropdownLabels, { generatorMenuOnly: true, requireArrowDropDown: true, optional: false });
    results.push(dropdownResult);
    if (!dropdownResult.ok) {
      return { ok: false, requestedOutputMode: config.requestedOutputMode, results, summary: await pageSummary() };
    }
    await delay(500);
  }
  results.push(await clickMatch(config.generatorLabels, { generatorMenuOnly: true, optional: !config.modelRequired }));
  await delay(300);

  results.push(await openBottomGeneratorChip());
  results.push(await clickMatch(config.aspectLabels, { generatorMenuOnly: true, optional: true }));
  await delay(300);

  results.push(await openBottomGeneratorChip());
  results.push(await clickMatch(config.countLabels, { exact: true, generatorMenuOnly: true, optional: true }));
  await page.keyboard.press("Escape").catch(() => {});
  await delay(300);

  const criticalResults = results.filter((item) => !item.optional);
  return {
    ok: criticalResults.every((item) => item.ok),
    requestedOutputMode: config.requestedOutputMode,
    results,
    summary: await pageSummary(),
  };
}
