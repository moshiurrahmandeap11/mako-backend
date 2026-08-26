import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { logger } from "../../../utils/logger";

/**
 * Loads YAML prompt configuration based on chosen template.
 */
export function loadAiPromptsYaml(template?: string): any {
  try {
    let filename = "customer_support_and_sales.yml"; // Default fallback
    if (template === "Customer Support") filename = "customer_support.yml";
    else if (template === "FAQ / Knowledge Base")
      filename = "faq_knowledge_base.yml";
    else if (template === "Booking & Scheduling")
      filename = "booking_and_scheduling.yml";
    else if (template === "Customer Support & Sales")
      filename = "customer_support_and_sales.yml";

    const candidatePaths = [
      path.resolve(process.cwd(), `config/prompts/${filename}`),
      path.resolve(__dirname, `../../../config/prompts/${filename}`),
      path.resolve(__dirname, `../../../../config/prompts/${filename}`),
      path.resolve(__dirname, `../../../../../config/prompts/${filename}`),
    ];

    for (const yamlPath of candidatePaths) {
      if (fs.existsSync(yamlPath)) {
        const content = fs.readFileSync(yamlPath, "utf8");
        return yaml.load(content);
      }
    }
  } catch (err) {
    logger.error("Failed to load YAML prompt config:", err);
  }
  return null;
}
