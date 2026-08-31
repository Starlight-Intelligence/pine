import amazonBedrockIcon from "@lobehub/icons-static-svg/icons/bedrock-color.svg";
import antGroupIcon from "@lobehub/icons-static-svg/icons/antgroup-color.svg";
import anthropicIcon from "@lobehub/icons-static-svg/icons/anthropic.svg";
import azureIcon from "@lobehub/icons-static-svg/icons/azure-color.svg";
import cerebrasIcon from "@lobehub/icons-static-svg/icons/cerebras-color.svg";
import cloudflareIcon from "@lobehub/icons-static-svg/icons/cloudflare-color.svg";
import deepSeekIcon from "@lobehub/icons-static-svg/icons/deepseek-color.svg";
import fireworksIcon from "@lobehub/icons-static-svg/icons/fireworks-color.svg";
import githubCopilotIcon from "@lobehub/icons-static-svg/icons/githubcopilot.svg";
import googleIcon from "@lobehub/icons-static-svg/icons/google-color.svg";
import groqIcon from "@lobehub/icons-static-svg/icons/groq.svg";
import huggingFaceIcon from "@lobehub/icons-static-svg/icons/huggingface-color.svg";
import kimiIcon from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import minimaxIcon from "@lobehub/icons-static-svg/icons/minimax-color.svg";
import mistralIcon from "@lobehub/icons-static-svg/icons/mistral-color.svg";
import moonshotIcon from "@lobehub/icons-static-svg/icons/moonshot.svg";
import nvidiaIcon from "@lobehub/icons-static-svg/icons/nvidia-color.svg";
import openAiIcon from "@lobehub/icons-static-svg/icons/openai.svg";
import opencodeIcon from "@lobehub/icons-static-svg/icons/opencode.svg";
import openRouterIcon from "@lobehub/icons-static-svg/icons/openrouter-color.svg";
import togetherIcon from "@lobehub/icons-static-svg/icons/together-color.svg";
import vercelIcon from "@lobehub/icons-static-svg/icons/vercel.svg";
import vertexAiIcon from "@lobehub/icons-static-svg/icons/vertexai-color.svg";
import workersAiIcon from "@lobehub/icons-static-svg/icons/workersai-color.svg";
import xAiIcon from "@lobehub/icons-static-svg/icons/xai.svg";
import xiaomiMimoIcon from "@lobehub/icons-static-svg/icons/xiaomimimo.svg";
import zhipuIcon from "@lobehub/icons-static-svg/icons/zhipu-color.svg";

export interface ProviderIconDefinition {
  monochrome?: boolean;
  src: string;
}

const PROVIDER_ICONS = {
  antgroup: { src: antGroupIcon },
  anthropic: { monochrome: true, src: anthropicIcon },
  azure: { src: azureIcon },
  bedrock: { src: amazonBedrockIcon },
  cerebras: { src: cerebrasIcon },
  cloudflare: { src: cloudflareIcon },
  deepseek: { src: deepSeekIcon },
  fireworks: { src: fireworksIcon },
  githubcopilot: { monochrome: true, src: githubCopilotIcon },
  google: { src: googleIcon },
  groq: { monochrome: true, src: groqIcon },
  huggingface: { src: huggingFaceIcon },
  kimi: { src: kimiIcon },
  minimax: { src: minimaxIcon },
  mistral: { src: mistralIcon },
  moonshot: { monochrome: true, src: moonshotIcon },
  nvidia: { src: nvidiaIcon },
  openai: { monochrome: true, src: openAiIcon },
  opencode: { monochrome: true, src: opencodeIcon },
  openrouter: { src: openRouterIcon },
  together: { src: togetherIcon },
  vercel: { monochrome: true, src: vercelIcon },
  vertexai: { src: vertexAiIcon },
  workersai: { src: workersAiIcon },
  xai: { monochrome: true, src: xAiIcon },
  xiaomimimo: { monochrome: true, src: xiaomiMimoIcon },
  zhipu: { src: zhipuIcon },
} as const satisfies Record<string, ProviderIconDefinition>;

type ProviderIconId = keyof typeof PROVIDER_ICONS;

const PROVIDER_ALIASES: Readonly<Record<string, ProviderIconId>> = {
  amazonbedrock: "bedrock",
  antgroup: "antgroup",
  antling: "antgroup",
  anthropic: "anthropic",
  azure: "azure",
  azureopenai: "azure",
  azureopenairesponses: "azure",
  bedrock: "bedrock",
  cerebras: "cerebras",
  cloudflare: "cloudflare",
  cloudflareaigateway: "cloudflare",
  cloudflareworkersai: "workersai",
  deepseek: "deepseek",
  fireworks: "fireworks",
  githubcopilot: "githubcopilot",
  google: "google",
  googlevertex: "vertexai",
  groq: "groq",
  huggingface: "huggingface",
  kimi: "kimi",
  kimicoding: "kimi",
  minimax: "minimax",
  minimaxcn: "minimax",
  mistral: "mistral",
  moonshot: "moonshot",
  moonshotai: "moonshot",
  moonshotaicn: "moonshot",
  nvidia: "nvidia",
  openai: "openai",
  openaicodex: "openai",
  opencode: "opencode",
  opencodego: "opencode",
  openrouter: "openrouter",
  together: "together",
  togetherai: "together",
  vercel: "vercel",
  vercelaigateway: "vercel",
  vertexai: "vertexai",
  workersai: "workersai",
  xai: "xai",
  xiaomi: "xiaomimimo",
  xiaomimimo: "xiaomimimo",
  xiaomitokenplanams: "xiaomimimo",
  xiaomitokenplancn: "xiaomimimo",
  xiaomitokenplansgp: "xiaomimimo",
  zai: "zhipu",
  zaicodingcn: "zhipu",
  zhipu: "zhipu",
};

function normalizeProvider(value: string): string {
  return value.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/g, "");
}

export function resolveProviderIcon(
  providerId: string,
  providerName?: string,
): ProviderIconDefinition | undefined {
  const iconId =
    PROVIDER_ALIASES[normalizeProvider(providerId)] ??
    (providerName
      ? PROVIDER_ALIASES[normalizeProvider(providerName)]
      : undefined);
  return iconId ? PROVIDER_ICONS[iconId] : undefined;
}
