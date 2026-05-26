import { existsSync } from "node:fs";

export function buildFlowIngredientPlan({ characterSheet = {} } = {}) {
  const paths = Array.isArray(characterSheet.referenceImagePaths)
    ? characterSheet.referenceImagePaths.filter((path) => existsSync(path)).slice(0, 4)
    : [];
  return {
    enabled: paths.length > 0,
    paths,
    mode: paths.length ? "ingredients-to-video" : "text-to-video",
  };
}

export async function attachFlowIngredients(page, paths = []) {
  if (!paths.length) return { attached: 0 };
  let attached = 0;
  for (const filePath of paths) {
    await openIngredientsUpload(page);
    const input = page.locator("input[type=file]").last();
    await input.waitFor({ state: "attached", timeout: 10000 });
    await input.setInputFiles(filePath);
    await page.waitForTimeout(800);
    attached += 1;
  }
  return { attached };
}

async function openIngredientsUpload(page) {
  const controls = [
    page.getByText(/Ingredients to Video|재료|Ingredients/i).first(),
    page.getByText(/Add Image|이미지 추가|Upload|업로드/i).first(),
    page.locator("button").filter({ hasText: /Add|Upload|Image|이미지|업로드/i }).first(),
  ];
  for (const control of controls) {
    try {
      await control.click({ timeout: 3000 });
      return;
    } catch {
      // Try the next likely Flow control.
    }
  }
  throw new Error("Google Flow Ingredients upload control was not found.");
}
