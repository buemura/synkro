import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Synkro",
      logo: {
        src: "./public/favicon.svg",
      },
      social: {
        github: "https://github.com/buemura/synkro",
      },
      customCss: ["./src/styles/custom.css"],
      head: [
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.googleapis.com",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
            rel: "stylesheet",
          },
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: "getting-started" },
        },
        {
          label: "@synkro/core",
          collapsed: false,
          autogenerate: { directory: "core" },
        },
        {
          label: "@synkro/ui",
          autogenerate: { directory: "ui" },
        },
        {
          label: "@synkro/nestjs",
          autogenerate: { directory: "nestjs" },
        },
        {
          label: "@synkro/next",
          autogenerate: { directory: "next" },
        },
        {
          label: "@synkro/agents",
          autogenerate: { directory: "agents" },
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
      ],
    }),
  ],
});
